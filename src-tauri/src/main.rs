use std::sync::{Arc, Mutex};
use std::sync::mpsc::{self, Sender};
use tauri::AppHandle;
use lsl::{StreamInfo, StreamOutlet, Pushable};

lazy_static::lazy_static! {
    static ref TX: Mutex<Option<Sender<Vec<f64>>>> = Mutex::new(None);
    static ref STREAM_STARTED: Mutex<bool> = Mutex::new(false);
}

#[tauri::command]
async fn start_lsl_stream(sps: f64) {
    let mut started = STREAM_STARTED.lock().unwrap();
    if *started {
        println!("Stream already started");
        return;
    }

    // Create channel
    let (tx, rx) = mpsc::channel::<Vec<f64>>();

    *TX.lock().unwrap() = Some(tx);
    *started = true;

    // Start the LSL stream in a separate thread
    std::thread::spawn(move || {
        let info = Arc::new(
            StreamInfo::new(
                "ORIC-OSEM",         // name
                "EXG",               // type
                8,                   // channel count
                sps,                 // sampling rate
                lsl::ChannelFormat::Double64,
                "oric",              // source ID
            )
            .unwrap(),
        );

        let outlet = Arc::new(Mutex::new(StreamOutlet::new(&info, 0, 360).unwrap()));

        while let Ok(channel_data) = rx.recv() {
            if let Ok(outlet) = outlet.lock() {
                if let Err(e) = outlet.push_sample(&channel_data) {
                    println!("Failed to push data to LSL: {:?}", e);
                }
            }
        }
    });

    println!("Started LSL stream with SPS: {}", sps);
}

#[tauri::command]
async fn start_streaming(channel_data: Vec<f64>, _app_handle: AppHandle) {
    // println!("Received data: {:?}", channel_data);

    if let Some(tx) = TX.lock().unwrap().as_ref() {
        if let Err(err) = tx.send(channel_data) {
            println!("Failed to send data to LSL thread: {:?}", err);
        }
    } else {
        println!("Stream not initialized. Call start_lsl_stream first.");
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![start_lsl_stream, start_streaming])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
