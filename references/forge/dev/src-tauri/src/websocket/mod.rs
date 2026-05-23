use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio::sync::watch;

pub async fn connect_ws(app: AppHandle, url: String, mut cancel: watch::Receiver<bool>) {
    let mut retry_delay = 1u64;
    loop {
        // Check cancellation before each connection attempt
        if *cancel.borrow() { break; }

        match connect_async(&url).await {
            Ok((ws_stream, _)) => {
                retry_delay = 1;
                if let Err(e) = app.emit("ws:connected", ()) {
                    eprintln!("Failed to emit ws:connected: {e}");
                }
                let (mut write, mut read) = ws_stream.split();

                // Register as desktop client so Strapi routes agent commands only to us
                let register_msg = serde_json::json!({"type": "desktop:register"}).to_string();
                let _ = write.send(Message::Text(register_msg)).await;

                loop {
                    tokio::select! {
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(text))) => {
                                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                                        if let Err(e) = app.emit("ws:message", json) {
                                            eprintln!("Failed to emit ws:message: {e}");
                                        }
                                    }
                                }
                                Some(Ok(Message::Close(_))) | None => break,
                                Some(Err(_)) => break,
                                _ => {}
                            }
                        }
                        _ = cancel.changed() => {
                            if *cancel.borrow() { break; }
                        }
                    }
                }

                if *cancel.borrow() { break; }

                if let Err(e) = app.emit("ws:disconnected", ()) {
                    eprintln!("Failed to emit ws:disconnected: {e}");
                }
            }
            Err(e) => {
                if let Err(emit_err) = app.emit("ws:error", e.to_string()) {
                    eprintln!("Failed to emit ws:error: {emit_err}");
                }
            }
        }

        // Wait with jitter to avoid thundering herd
        let jitter_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_millis() as u64 % 1000;
        let sleep_ms = retry_delay * 1000 + jitter_ms;
        tokio::select! {
            _ = tokio::time::sleep(std::time::Duration::from_millis(sleep_ms)) => {}
            _ = cancel.changed() => {
                if *cancel.borrow() { break; }
            }
        }
        retry_delay = (retry_delay * 2).min(30);
    }
}
