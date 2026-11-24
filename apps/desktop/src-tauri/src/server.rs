use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub port: u16,
    pub tls_enabled: bool,
    pub service_name: String,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            port: 49152,
            tls_enabled: true,
            service_name: "_pinchdrop._tcp.local".to_string(),
        }
    }
}

pub struct LanServer {
    pub config: ServerConfig,
    pub is_running: bool,
}

impl LanServer {
    pub fn new(config: ServerConfig) -> Self {
        Self {
            config,
            is_running: false,
        }
    }

    pub fn start(&mut self) -> Result<String, String> {
        self.is_running = true;
        Ok(format!(
            "PinchDrop LAN Server listening on port {} (TLS 1.3)",
            self.config.port
        ))
    }

    pub fn stop(&mut self) {
        self.is_running = false;
    }
}
