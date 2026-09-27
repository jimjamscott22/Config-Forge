use crate::filesystem::paths::Environment;

pub struct AppState {
    pub environment: Box<dyn Environment>,
}
