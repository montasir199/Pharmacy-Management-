use std::{
    io::Write,
    net::{IpAddr, SocketAddr, TcpStream},
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use escpos::driver::{Driver, UsbDriver};
use flume::RecvTimeoutError;
use image::{imageops::FilterType, DynamicImage, GrayImage, ImageFormat, ImageReader};
use mdns_sd::{ServiceDaemon, ServiceEvent};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;
const MAX_IMAGE_HEIGHT: u32 = 65_535;
const NETWORK_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterConfig {
    pub id: Option<i64>,
    pub name: String,
    pub connection_type: String,
    pub vendor_id: Option<u16>,
    pub product_id: Option<u16>,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub paper_width: String,
    pub dpi: u16,
    pub copies: u8,
    pub auto_cut: bool,
    pub auto_print: bool,
    pub print_logo: bool,
    pub font_size: u8,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbPrinter {
    pub vendor_id: u16,
    pub product_id: u16,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkPrinter {
    pub name: String,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintJobSummary {
    pub id: i64,
    pub sale_id: Option<i64>,
    pub invoice_number: Option<String>,
    pub printer_id: Option<i64>,
    pub printer_name: Option<String>,
    pub job_type: String,
    pub status: String,
    pub attempt_count: i64,
    pub last_error: Option<String>,
    pub created_at: String,
}

pub struct PreparedPrint {
    pub job_id: i64,
    printer: PrinterConfig,
    png_base64: String,
}

pub fn list_printers(connection: &Connection) -> Result<Vec<PrinterConfig>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT id, name, connection_type, vendor_id, product_id, host, port, paper_width,
                dpi, copies, auto_cut, auto_print, print_logo, font_size, is_default
         FROM receipt_printers ORDER BY is_default DESC, name COLLATE NOCASE",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(PrinterConfig {
            id: Some(row.get(0)?),
            name: row.get(1)?,
            connection_type: row.get(2)?,
            vendor_id: row.get(3)?,
            product_id: row.get(4)?,
            host: row.get(5)?,
            port: row.get(6)?,
            paper_width: row.get(7)?,
            dpi: row.get(8)?,
            copies: row.get(9)?,
            auto_cut: row.get(10)?,
            auto_print: row.get(11)?,
            print_logo: row.get(12)?,
            font_size: row.get(13)?,
            is_default: row.get(14)?,
        })
    })?;
    rows.collect()
}

pub fn save_printer(
    connection: &mut Connection,
    mut printer: PrinterConfig,
) -> Result<i64, String> {
    validate_printer(&printer)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let has_default: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM receipt_printers WHERE is_default = 1)",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    printer.is_default |= !has_default;
    if printer.is_default {
        transaction
            .execute("UPDATE receipt_printers SET is_default = 0", [])
            .map_err(|error| error.to_string())?;
    }

    let id = if let Some(id) = printer.id {
        let changed = transaction
            .execute(
                "UPDATE receipt_printers SET
                    name = ?1, connection_type = ?2, vendor_id = ?3, product_id = ?4,
                    host = ?5, port = ?6, paper_width = ?7, dpi = ?8, copies = ?9,
                    auto_cut = ?10, auto_print = ?11, print_logo = ?12, font_size = ?13,
                    is_default = ?14
                 WHERE id = ?15",
                params![
                    printer.name.trim(),
                    printer.connection_type,
                    printer.vendor_id,
                    printer.product_id,
                    printer.host,
                    printer.port,
                    printer.paper_width,
                    printer.dpi,
                    printer.copies,
                    printer.auto_cut,
                    printer.auto_print,
                    printer.print_logo,
                    printer.font_size,
                    printer.is_default,
                    id
                ],
            )
            .map_err(|error| error.to_string())?;
        if changed == 0 {
            return Err("printer configuration was not found".to_owned());
        }
        id
    } else {
        transaction
            .execute(
                "INSERT INTO receipt_printers (
                    name, connection_type, vendor_id, product_id, host, port, paper_width,
                    dpi, copies, auto_cut, auto_print, print_logo, font_size, is_default
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    printer.name.trim(),
                    printer.connection_type,
                    printer.vendor_id,
                    printer.product_id,
                    printer.host,
                    printer.port,
                    printer.paper_width,
                    printer.dpi,
                    printer.copies,
                    printer.auto_cut,
                    printer.auto_print,
                    printer.print_logo,
                    printer.font_size,
                    printer.is_default
                ],
            )
            .map_err(|error| error.to_string())?;
        transaction.last_insert_rowid()
    };
    transaction.commit().map_err(|error| error.to_string())?;
    printer.id = Some(id);
    Ok(id)
}

pub fn remove_printer(connection: &mut Connection, printer_id: i64) -> Result<(), String> {
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    let changed = transaction
        .execute("DELETE FROM receipt_printers WHERE id = ?1", [printer_id])
        .map_err(|error| error.to_string())?;
    if changed == 0 {
        return Err("printer configuration was not found".to_owned());
    }
    transaction
        .execute(
            "UPDATE receipt_printers SET is_default = 1
             WHERE id = (SELECT MIN(id) FROM receipt_printers)
               AND NOT EXISTS (SELECT 1 FROM receipt_printers WHERE is_default = 1)",
            [],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())?;
    Ok(())
}

pub fn discover_usb_printers() -> Result<Vec<UsbPrinter>, String> {
    let devices = rusb::devices().map_err(|error| format!("USB discovery failed: {error}"))?;
    let mut printers = Vec::new();
    for device in devices.iter() {
        let descriptor = device
            .device_descriptor()
            .map_err(|error| format!("USB device descriptor failed: {error}"))?;
        let has_printer_interface = if descriptor.class_code() == 7 {
            true
        } else {
            match device.config_descriptor(0) {
                Ok(config) => config
                    .interfaces()
                    .any(|interface| interface.descriptors().any(|alt| alt.class_code() == 7)),
                Err(error) => {
                    tracing::debug!(
                        vendor_id = descriptor.vendor_id(),
                        product_id = descriptor.product_id(),
                        %error,
                        "Could not inspect USB device configuration"
                    );
                    false
                }
            }
        };
        if !has_printer_interface {
            continue;
        }
        let name = device
            .open()
            .ok()
            .and_then(|handle| handle.read_product_string_ascii(&descriptor).ok())
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                format!(
                    "USB {:04X}:{:04X}",
                    descriptor.vendor_id(),
                    descriptor.product_id()
                )
            });
        printers.push(UsbPrinter {
            vendor_id: descriptor.vendor_id(),
            product_id: descriptor.product_id(),
            name,
        });
    }
    Ok(printers)
}

pub fn discover_network_printers() -> Result<Vec<NetworkPrinter>, String> {
    const SERVICE_TYPE: &str = "_pdl-datastream._tcp.local.";
    let daemon = ServiceDaemon::new()
        .map_err(|error| format!("Local network printer discovery could not start: {error}"))?;
    let receiver = daemon
        .browse(SERVICE_TYPE)
        .map_err(|error| format!("Local network printer discovery failed: {error}"))?;
    let deadline = Instant::now() + Duration::from_secs(2);
    let mut printers = Vec::new();
    while Instant::now() < deadline {
        let timeout = deadline
            .saturating_duration_since(Instant::now())
            .min(Duration::from_millis(200));
        match receiver.recv_timeout(timeout) {
            Ok(ServiceEvent::ServiceResolved(service)) => {
                for address in service.get_addresses_v4() {
                    if !is_local_network_ip(IpAddr::V4(*address)) || service.get_port() == 0 {
                        continue;
                    }
                    printers.push(NetworkPrinter {
                        name: service.get_fullname().to_owned(),
                        host: address.to_string(),
                        port: service.get_port(),
                    });
                }
            }
            Ok(_) | Err(RecvTimeoutError::Timeout) => {}
            Err(error) => {
                let _ = daemon.shutdown();
                return Err(format!("Local network printer discovery failed: {error}"));
            }
        }
    }
    daemon
        .stop_browse(SERVICE_TYPE)
        .map_err(|error| format!("Local network printer discovery could not stop: {error}"))?;
    daemon
        .shutdown()
        .map_err(|error| format!("Local network printer discovery could not stop: {error}"))?;
    printers.sort_by(|left, right| {
        (&left.name, &left.host, left.port).cmp(&(&right.name, &right.host, right.port))
    });
    printers.dedup_by(|left, right| left.host == right.host && left.port == right.port);
    Ok(printers)
}

pub fn list_jobs(connection: &Connection) -> Result<Vec<PrintJobSummary>, rusqlite::Error> {
    let mut statement = connection.prepare(
        "SELECT jobs.id, jobs.sale_id, sales.invoice_number, jobs.printer_id, printers.name,
                jobs.job_type, jobs.status, jobs.attempt_count, jobs.last_error, jobs.created_at
         FROM print_jobs jobs
         LEFT JOIN sales ON sales.id = jobs.sale_id
         LEFT JOIN receipt_printers printers ON printers.id = jobs.printer_id
         ORDER BY jobs.id DESC LIMIT 50",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(PrintJobSummary {
            id: row.get(0)?,
            sale_id: row.get(1)?,
            invoice_number: row.get(2)?,
            printer_id: row.get(3)?,
            printer_name: row.get(4)?,
            job_type: row.get(5)?,
            status: row.get(6)?,
            attempt_count: row.get(7)?,
            last_error: row.get(8)?,
            created_at: row.get(9)?,
        })
    })?;
    rows.collect()
}

pub fn prepare_sale(
    connection: &mut Connection,
    sale_id: i64,
    printer_id: Option<i64>,
    png_base64: &str,
) -> Result<PreparedPrint, String> {
    let printer = get_printer(connection, printer_id)?;
    prepare_job(
        connection,
        Some(sale_id),
        &printer,
        "sale",
        png_base64,
        None,
    )
}

pub fn prepare_test(
    connection: &mut Connection,
    printer_id: i64,
    png_base64: &str,
) -> Result<PreparedPrint, String> {
    let printer = get_printer(connection, Some(printer_id))?;
    prepare_job(connection, None, &printer, "test", png_base64, None)
}

pub fn prepare_retry(
    connection: &mut Connection,
    job_id: i64,
    png_base64: &str,
) -> Result<PreparedPrint, String> {
    let printer_id: Option<i64> = connection
        .query_row(
            "SELECT printer_id FROM print_jobs WHERE id = ?1",
            [job_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "print job was not found".to_owned())?;
    let printer = get_printer(connection, printer_id)?;
    let job = connection
        .query_row(
            "SELECT sale_id, job_type FROM print_jobs WHERE id = ?1",
            [job_id],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, String>(1)?)),
        )
        .map_err(|error| error.to_string())?;
    prepare_job(
        connection,
        job.0,
        &printer,
        &job.1,
        png_base64,
        Some(job_id),
    )
}

pub fn send_prepared(prepared: &PreparedPrint) -> Result<(), String> {
    let raster = decode_raster(&prepared.png_base64, &prepared.printer)?;
    let mut payload = Vec::new();
    payload.extend_from_slice(&[0x1b, 0x40]);
    for _ in 0..prepared.printer.copies {
        payload.extend_from_slice(&raster);
        payload.extend_from_slice(&[0x1b, 0x64, 0x03]);
        if prepared.printer.auto_cut {
            payload.extend_from_slice(&[0x1d, 0x56, 0x00]);
        }
    }
    send_to_printer(&prepared.printer, &payload)
}

pub fn complete_job(
    connection: &Connection,
    job_id: i64,
    result: Result<(), String>,
) -> Result<PrintJobSummary, String> {
    let (status, error) = match result {
        Ok(()) => ("printed", None),
        Err(error) => ("failed", Some(error)),
    };
    connection
        .execute(
            "UPDATE print_jobs SET status = ?1, last_error = ?2,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?3",
            params![status, error, job_id],
        )
        .map_err(|error| error.to_string())?;
    get_job(connection, job_id)
}

pub fn recover_interrupted_jobs(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute(
        "UPDATE print_jobs
         SET status = 'failed', last_error = 'Printing was interrupted when the application closed',
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE status IN ('queued', 'printing')",
        [],
    )?;
    Ok(())
}

fn get_printer(connection: &Connection, printer_id: Option<i64>) -> Result<PrinterConfig, String> {
    let printers = list_printers(connection).map_err(|error| error.to_string())?;
    printers
        .into_iter()
        .find(|printer| match printer_id {
            Some(id) => printer.id == Some(id),
            None => printer.is_default,
        })
        .ok_or_else(|| {
            if printer_id.is_some() {
                "printer configuration was not found".to_owned()
            } else {
                "no default receipt printer is configured".to_owned()
            }
        })
}

fn validate_printer(printer: &PrinterConfig) -> Result<(), String> {
    if printer.name.trim().is_empty() || printer.name.len() > 100 {
        return Err("printer name must be between 1 and 100 characters".to_owned());
    }
    if !matches!(printer.paper_width.as_str(), "80mm" | "58mm") {
        return Err("paper width must be 80mm or 58mm".to_owned());
    }
    if !matches!(printer.dpi, 203 | 300) {
        return Err("printer resolution must be 203 or 300 DPI".to_owned());
    }
    if !(1..=5).contains(&printer.copies) {
        return Err("copy count must be between 1 and 5".to_owned());
    }
    if !(8..=32).contains(&printer.font_size) {
        return Err("font size must be between 8 and 32".to_owned());
    }
    match printer.connection_type.as_str() {
        "usb" if printer.vendor_id.is_some() && printer.product_id.is_some() => Ok(()),
        "network" => {
            let host = printer
                .host
                .as_deref()
                .ok_or_else(|| "network printer IP address is required".to_owned())?;
            let ip = host
                .parse::<IpAddr>()
                .map_err(|_| "network printer address must be an IP address".to_owned())?;
            if !is_local_network_ip(ip) {
                return Err(
                    "network printer address must be a local, private, or loopback IP".to_owned(),
                );
            }
            if !printer.port.is_some_and(|port| port > 0) {
                return Err("network printer port must be between 1 and 65535".to_owned());
            }
            Ok(())
        }
        "usb" => Err("USB vendor and product IDs are required".to_owned()),
        _ => Err("printer connection must be USB or network".to_owned()),
    }
}

fn is_local_network_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => ip.is_private() || ip.is_loopback() || ip.is_link_local(),
        IpAddr::V6(ip) => ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local(),
    }
}

fn prepare_job(
    connection: &mut Connection,
    sale_id: Option<i64>,
    printer: &PrinterConfig,
    job_type: &str,
    png_base64: &str,
    existing_job_id: Option<i64>,
) -> Result<PreparedPrint, String> {
    let printer_id = printer
        .id
        .ok_or_else(|| "printer configuration has no database ID".to_owned())?;
    let job_id = if let Some(job_id) = existing_job_id {
        connection
            .execute(
                "UPDATE print_jobs
                 SET status = 'queued', last_error = NULL,
                     updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                 WHERE id = ?1",
                [job_id],
            )
            .map_err(|error| error.to_string())?;
        job_id
    } else {
        connection
            .execute(
                "INSERT INTO print_jobs (sale_id, printer_id, job_type, status)
                 VALUES (?1, ?2, ?3, 'queued')",
                params![sale_id, printer_id, job_type],
            )
            .map_err(|error| error.to_string())?;
        connection.last_insert_rowid()
    };
    connection
        .execute(
            "UPDATE print_jobs
             SET status = 'printing', attempt_count = attempt_count + 1,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
             WHERE id = ?1",
            [job_id],
        )
        .map_err(|error| error.to_string())?;

    Ok(PreparedPrint {
        job_id,
        printer: printer.clone(),
        png_base64: png_base64.to_owned(),
    })
}

fn get_job(connection: &Connection, job_id: i64) -> Result<PrintJobSummary, String> {
    connection
        .query_row(
            "SELECT jobs.id, jobs.sale_id, sales.invoice_number, jobs.printer_id, printers.name,
                    jobs.job_type, jobs.status, jobs.attempt_count, jobs.last_error, jobs.created_at
             FROM print_jobs jobs
             LEFT JOIN sales ON sales.id = jobs.sale_id
             LEFT JOIN receipt_printers printers ON printers.id = jobs.printer_id
             WHERE jobs.id = ?1",
            [job_id],
            |row| {
                Ok(PrintJobSummary {
                    id: row.get(0)?,
                    sale_id: row.get(1)?,
                    invoice_number: row.get(2)?,
                    printer_id: row.get(3)?,
                    printer_name: row.get(4)?,
                    job_type: row.get(5)?,
                    status: row.get(6)?,
                    attempt_count: row.get(7)?,
                    last_error: row.get(8)?,
                    created_at: row.get(9)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

fn decode_raster(png_base64: &str, printer: &PrinterConfig) -> Result<Vec<u8>, String> {
    if png_base64.len() > MAX_IMAGE_BYTES * 4 / 3 + 4 {
        return Err("receipt image exceeds the 15 MiB limit".to_owned());
    }
    let decoded = STANDARD
        .decode(png_base64)
        .map_err(|error| format!("receipt image is not valid base64: {error}"))?;
    if decoded.len() > MAX_IMAGE_BYTES {
        return Err("receipt image exceeds the 15 MiB limit".to_owned());
    }
    let image = ImageReader::with_format(std::io::Cursor::new(decoded), ImageFormat::Png)
        .decode()
        .map_err(|error| format!("receipt image is not a valid PNG: {error}"))?;
    encode_raster(&image, &printer.paper_width, printer.dpi)
}

fn encode_raster(image: &DynamicImage, paper_width: &str, dpi: u16) -> Result<Vec<u8>, String> {
    let paper_mm = match paper_width {
        "80mm" => 72.0,
        "58mm" => 48.0,
        _ => return Err("unsupported paper width".to_owned()),
    };
    let width = ((paper_mm * f64::from(dpi)) / 25.4).round() as u32;
    let source_width = image.width();
    let source_height = image.height();
    if source_width == 0 || source_height == 0 {
        return Err("receipt image has no pixels".to_owned());
    }
    let height =
        ((u64::from(source_height) * u64::from(width)).div_ceil(u64::from(source_width))) as u32;
    if height == 0 || height > MAX_IMAGE_HEIGHT {
        return Err("receipt image height exceeds the ESC/POS limit".to_owned());
    }
    let gray: GrayImage = image
        .resize_exact(width, height, FilterType::Lanczos3)
        .to_luma8();
    let row_bytes = width.div_ceil(8) as usize;
    let mut raster = Vec::with_capacity(8 + row_bytes * height as usize);
    raster.extend_from_slice(&[
        0x1d,
        0x76,
        0x30,
        0x00,
        (row_bytes & 0xff) as u8,
        ((row_bytes >> 8) & 0xff) as u8,
        (height & 0xff) as u8,
        ((height >> 8) & 0xff) as u8,
    ]);
    for y in 0..height {
        for x_byte in 0..row_bytes {
            let mut packed = 0_u8;
            for bit in 0..8 {
                let x = x_byte * 8 + bit;
                if x < width as usize && gray.get_pixel(x as u32, y).0[0] < 160 {
                    packed |= 0x80 >> bit;
                }
            }
            raster.push(packed);
        }
    }
    Ok(raster)
}

fn send_to_printer(printer: &PrinterConfig, payload: &[u8]) -> Result<(), String> {
    match printer.connection_type.as_str() {
        "usb" => {
            let vendor_id = printer
                .vendor_id
                .ok_or_else(|| "USB vendor ID is missing".to_owned())?;
            let product_id = printer
                .product_id
                .ok_or_else(|| "USB product ID is missing".to_owned())?;
            let driver = UsbDriver::open(vendor_id, product_id, Some(NETWORK_TIMEOUT), None)
                .map_err(|error| format!("USB printer connection failed: {error}"))?;
            driver
                .write(payload)
                .and_then(|_| driver.flush())
                .map_err(|error| format!("USB print failed: {error}"))
        }
        "network" => {
            let host = printer
                .host
                .as_deref()
                .ok_or_else(|| "network printer IP is missing".to_owned())?;
            let ip = host
                .parse::<IpAddr>()
                .map_err(|_| "network printer IP is invalid".to_owned())?;
            if !is_local_network_ip(ip) {
                return Err("network printer address is not local".to_owned());
            }
            let port = printer
                .port
                .ok_or_else(|| "network printer port is missing".to_owned())?;
            let mut stream =
                TcpStream::connect_timeout(&SocketAddr::new(ip, port), NETWORK_TIMEOUT)
                    .map_err(|error| format!("network printer connection failed: {error}"))?;
            stream
                .set_write_timeout(Some(NETWORK_TIMEOUT))
                .map_err(|error| format!("network printer timeout could not be set: {error}"))?;
            stream
                .write_all(payload)
                .and_then(|_| stream.flush())
                .map_err(|error| format!("network print failed: {error}"))
        }
        _ => Err("unsupported printer connection".to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GrayImage, ImageBuffer, Luma};

    #[test]
    fn encodes_a_raster_image_as_escpos_bit_image_commands() {
        let image = GrayImage::from_pixel(100, 4, Luma([0]));
        let encoded = encode_raster(&DynamicImage::ImageLuma8(image), "58mm", 203)
            .expect("encode raster image");

        assert_eq!(&encoded[..4], &[0x1d, 0x76, 0x30, 0x00]);
        assert_eq!(encoded[4], 48);
        assert_eq!(encoded[5], 0);
        assert_eq!(encoded[6], 16);
        assert_eq!(encoded[7], 0);
        assert!(encoded[8..].iter().all(|byte| *byte == 0xff));
    }

    #[test]
    fn rejects_public_network_printer_addresses() {
        let printer = PrinterConfig {
            id: None,
            name: "Network".to_owned(),
            connection_type: "network".to_owned(),
            vendor_id: None,
            product_id: None,
            host: Some("203.0.113.4".to_owned()),
            port: Some(9100),
            paper_width: "80mm".to_owned(),
            dpi: 203,
            copies: 1,
            auto_cut: true,
            auto_print: false,
            print_logo: true,
            font_size: 12,
            is_default: true,
        };

        assert!(validate_printer(&printer).is_err());
    }

    #[test]
    fn raster_dimensions_follow_selected_width_and_resolution() {
        let image = DynamicImage::ImageLuma8(ImageBuffer::from_pixel(100, 10, Luma([255])));
        let encoded = encode_raster(&image, "80mm", 300).expect("encode raster image");

        assert_eq!(encoded[4], 107);
        assert_eq!(encoded[5], 0);
    }

    #[test]
    fn failed_print_is_recorded_without_a_sale_dependency() {
        let mut connection = Connection::open_in_memory().expect("open database");
        crate::database::migrations()
            .to_latest(&mut connection)
            .expect("apply migrations");
        let printer = PrinterConfig {
            id: None,
            name: "Test network printer".to_owned(),
            connection_type: "network".to_owned(),
            vendor_id: None,
            product_id: None,
            host: Some("127.0.0.1".to_owned()),
            port: Some(9100),
            paper_width: "58mm".to_owned(),
            dpi: 203,
            copies: 1,
            auto_cut: true,
            auto_print: false,
            print_logo: true,
            font_size: 12,
            is_default: false,
        };
        let printer_id = save_printer(&mut connection, printer).expect("save printer");
        let saved_printer = list_printers(&connection).expect("list printers");
        assert!(saved_printer[0].is_default);

        let prepared = prepare_test(&mut connection, printer_id, "not-valid-base64")
            .expect("create print attempt");
        let result = send_prepared(&prepared);
        let job = complete_job(&connection, prepared.job_id, result).expect("finish failed job");

        assert_eq!(job.status, "failed");
        assert_eq!(job.attempt_count, 1);
        assert!(job
            .last_error
            .as_deref()
            .is_some_and(|error| error.contains("base64")));
        assert_eq!(job.sale_id, None);
    }
}
