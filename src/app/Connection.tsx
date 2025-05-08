"use client";
import React, { useState, useRef, useEffect } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { EXGFilter, Notch, five } from './filters';
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation"; // Import useRouter
import { getCustomColor } from './Colors';
import { core } from "@tauri-apps/api";

import {
    Cable,
    Circle,
    CircleStop,
    CircleX,
    Infinity,
    Trash2,
    Download,
    FileArchive,
    Pause,
    Play,
    CircleOff,
    ReplaceAll,
    Heart,
    Brain,
    Eye,
    BicepsFlexed,
    ArrowRightToLine,
    ArrowLeftToLine,
    Settings,
    Loader,
    ArrowLeftIcon,
    ArrowRightIcon
} from "lucide-react";
import { toast } from "sonner";
import { saveAs } from "file-saver";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "./ui/tooltip";
import { Separator } from "./ui/separator";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "./ui/popover";
interface WebSocketCommand {
    command: string;
    parameters: any[];
}



interface ConnectionProps {
    onPauseChange: (pause: boolean) => void; // Callback to pass pause state to parent
    datastream: (data: number[]) => void;
    Connection: (isDeviceConnected: boolean) => void;
    isDisplay: boolean;
    setIsDisplay: React.Dispatch<React.SetStateAction<boolean>>;
    setCanvasCount: React.Dispatch<React.SetStateAction<number>>; // Specify type for setCanvasCount
    canvasCount: number;
    selectedChannels: number[]; // Array of selected channel indices
    setSelectedChannels: React.Dispatch<React.SetStateAction<number[]>>; // State updater for selectedChannels
    channelCount: number;
    timeBase: number;
    setTimeBase: React.Dispatch<React.SetStateAction<number>>;
    SetZoom: React.Dispatch<React.SetStateAction<number>>;
    SetCurrentSnapshot: React.Dispatch<React.SetStateAction<number>>;
    currentSamplingRate: number;
    setCurrentSamplingRate: React.Dispatch<React.SetStateAction<number>>;
    currentSnapshot: number;
    Zoom: number;
    snapShotRef: React.RefObject<boolean[]>;
}

const Connection: React.FC<ConnectionProps> = ({
    onPauseChange,
    datastream,
    Connection,
    isDisplay,
    setIsDisplay,
    setCanvasCount,
    canvasCount,
    setSelectedChannels,
    selectedChannels,
    SetCurrentSnapshot,
    currentSnapshot,
    snapShotRef,
    SetZoom,
    Zoom,
    timeBase,
    setTimeBase,
    currentSamplingRate,
    setCurrentSamplingRate
}) => {

    // States and Refs for Connection & Recording
    const [isDeviceConnected, setIsDeviceConnected] = useState<boolean>(false); // Track if the device is connected
    const isDeviceConnectedRef = useRef<boolean>(false); // Ref to track if the device is connected
    const isRecordingRef = useRef<boolean>(false); // Ref to track if the device is recording
    // UI States for Popovers and Buttons
    const [isEndTimePopoverOpen, setIsEndTimePopoverOpen] = useState(false);
    const [isAllEnabledChannelSelected, setIsAllEnabledChannelSelected] = useState(false);
    const [isSelectAllDisabled, setIsSelectAllDisabled] = useState(false);
    const [isRecordButtonDisabled, setIsRecordButtonDisabled] = useState(false);
    const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
    const [isSettingOpen, setIsSettingOpen] = useState(false);
    const [manuallySelected, setManuallySelected] = useState(false); // New state to track manual selection
    // Data States
    const detectedBitsRef = React.useRef(24);
    const [datasets, setDatasets] = useState<any[]>([]);
    const [recordingElapsedTime, setRecordingElapsedTime] = useState<number>(0); // State to store the recording duration
    const [customTimeInput, setCustomTimeInput] = useState<string>(""); // State to store the custom stop time input
    const [leftArrowClickCount, setLeftArrowClickCount] = useState(0); // Track how many times the left arrow is clicked
    const existingRecordRef = useRef<any | undefined>(undefined);
    const devicenameref = useRef<string>("");
    const [deviceReady, setDeviceReady] = useState(false);
    const sampingrateref = useRef<number>(0);
    const [open, setOpen] = useState(false);
    const [isPauseSate, setIsPauseState] = useState(false);
    // UI Themes & Modes
    const { theme } = useTheme(); // Current theme of the app
    const isDarkModeEnabled = theme === "dark"; // Boolean to check if dark mode is enabled
    const router = useRouter(); // Use Next.js router for navigation
    // Determine the current theme without redeclaring 'theme'
    const activeTheme: 'light' | 'dark' = isDarkModeEnabled ? 'dark' : 'light';
    // Time and End Time Tracking
    const recordingStartTimeRef = useRef<number>(0);
    const endTimeRef = useRef<number | null>(null); // Ref to store the end time of the recording
    const [currentChannel, setCurrentChannel] = useState(0);
    // Serial Port States
    const readerRef = useRef<
        ReadableStreamDefaultReader<Uint8Array> | null | undefined
    >(null); // Ref to store the reader for the serial port
    const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(
        null
    );

    // Canvas Settings & Channels
    const canvasElementCountRef = useRef<number>(1);
    const maxCanvasElementCountRef = useRef<number>(1);
    const channelNames = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => `CH${i + 1}`);
    const currentFileNameRef = useRef<string>("");
    const initialSelectedChannelsRef = useRef<any[]>([1]);

    // Buffer Management
    const buffer: number[] = []; // Buffer to store incoming data
    const NUM_BUFFERS = 4;
    const MAX_BUFFER_SIZE = 500;
    const recordingBuffers = Array(NUM_BUFFERS)
        .fill(null)
        .map(() => [] as number[][]);
    const fillingindex = useRef<number>(0); // Initialize useRef with 0
    const spsToRateMap: Record<number, number> = {
        0x96: 250,
        0x95: 500,
        0x94: 1000,
        0x93: 2000,
        0x92: 4000,
        0x91: 8000,
        0x90: 16000
    };
    // Update both sps and currentSamplingRate when the select changes
    const handleSpsChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedSps = Number(e.target.value);
        setSps(selectedSps);
        setCurrentSamplingRate(spsToRateMap[selectedSps]);
        console.log(selectedSps, spsToRateMap[selectedSps], currentSamplingRate);
    };

    // Loading State
    const [isLoading, setIsLoading] = useState(false); // Track loading state for asynchronous operations
    //config
    const [sps, setSps] = useState<number>(0x96);
    const channels = 8;
    const [channelConfigs, setChannelConfigs] = useState(
        Array.from({ length: 8 }, () => ({
            powerdown: false,
            srb2: false,
            pgaGain: 0b000,
            channelInput: "Normal",
        })));
    const handleChannelConfigChange = (
        index: number,
        key: string,
        value: any
    ) => {
        setChannelConfigs((prevConfigs) => {
            const updatedConfigs = [...prevConfigs];
            updatedConfigs[index] = {
                ...updatedConfigs[index],
                [key]: value,
            };
            return updatedConfigs;
        });
    };
    ///////

    let activeBufferIndex = 0;
    const togglePause = () => {
        const newPauseState = !isDisplay;
        setIsDisplay(newPauseState);
        onPauseChange(newPauseState); // Notify parent about the change
        SetCurrentSnapshot(0);
        setLeftArrowClickCount(0);
        setIsPauseState(!newPauseState); // <-- Fix: use the new state
    };


    const enabledClicks = (snapShotRef.current?.filter(Boolean).length ?? 0) - 1;

    // Enable/Disable left arrow button
    const handlePrevSnapshot = () => {
        if (leftArrowClickCount < enabledClicks) {
            setLeftArrowClickCount((prevCount) => prevCount + 1); // Use functional update
        }

        if (currentSnapshot < 4) {
            SetCurrentSnapshot((prevSnapshot) => prevSnapshot + 1); // Use functional update
        }
    };

    useEffect(() => {
        if (!deviceReady || !devicenameref.current || maxCanvasElementCountRef.current === undefined) return;

        const enabledChannels = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i + 1);

        // Retrieve saved devices from localStorage
        const savedPorts = JSON.parse(localStorage.getItem("savedDevices") || "[]");

        let initialSelectedChannelsRefs: number[] = []; // Default to channel 1



        setSelectedChannels(initialSelectedChannelsRefs);

        // Determine "Select All" state
        const allSelected = initialSelectedChannelsRefs.length === enabledChannels.length;
        setIsAllEnabledChannelSelected(allSelected);
        setIsSelectAllDisabled(initialSelectedChannelsRefs.length === enabledChannels.length - 1);
    }, [deviceReady, maxCanvasElementCountRef.current]);


    useEffect(() => {
        const enabledChannels = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i + 1);

        const allSelected = selectedChannels.length === enabledChannels.length;
        const onlyOneLeft = selectedChannels.length === enabledChannels.length - 1;

        setIsSelectAllDisabled((allSelected && manuallySelected) || onlyOneLeft);

        // Update the "Select All" button state
        setIsAllEnabledChannelSelected(allSelected);
    }, [selectedChannels, maxCanvasElementCountRef.current, manuallySelected]);

    const handleSelectAllToggle = () => {
        const enabledChannels = Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i);

        if (!isAllEnabledChannelSelected) {
            // Programmatic selection of all channels
            setManuallySelected(false); // Mark as not manual
            setSelectedChannels(enabledChannels); // Select all channels
        } else {
            // RESET functionality
            let initialSelectedChannelsRefs: number[] = [0]; // Default to channel 1 if no saved channels are found

            // Set the channels back to saved values
            setSelectedChannels(initialSelectedChannelsRefs); // Reset to saved channels
        }

        // Toggle the "Select All" button state
        setIsAllEnabledChannelSelected((prevState) => !prevState);
    };

    const toggleChannel = (channelIndex: number) => {
        setSelectedChannels((prevSelected) => {
            setManuallySelected(true);
            const updatedChannels = prevSelected.includes(channelIndex)
                ? prevSelected.filter((ch) => ch !== channelIndex)
                : [...prevSelected, channelIndex];

            const sortedChannels = updatedChannels.sort((a, b) => a - b);

            if (sortedChannels.length === 0) {
                sortedChannels.push(1);
            }

            // Retrieve saved devices from localStorage
            const savedPorts = JSON.parse(localStorage.getItem('savedDevices') || '[]');



            return sortedChannels;
        });
    };

    // Handle right arrow click (reset count and disable button if needed)
    const handleNextSnapshot = () => {
        if (leftArrowClickCount > 0) {
            setLeftArrowClickCount((prevCount) => prevCount - 1); // Use functional update for more clarity
        }
        if (currentSnapshot > 0) {
            SetCurrentSnapshot((prevSnapshot) => prevSnapshot - 1); // Use functional update for more clarity
        }
    };

    // Added useEffect to sync canvasCount state with the canvasElementCountRef and re-render when isRecordingRef changes
    useEffect(() => {
        canvasElementCountRef.current = canvasCount; // Sync the ref with the state
    }, [canvasCount, isRecordingRef]);


    const handleTimeSelection = (minutes: number | null) => {
        // Function to handle the time selection
        if (minutes === null) {
            endTimeRef.current = null;
            toast.success("Recording set to no time limit");
        } else {
            // If the time is not null, set the end time
            const newEndTimeSeconds = minutes * 60 * 1000;
            if (newEndTimeSeconds <= recordingElapsedTime) {
                // Check if the end time is greater than the current elapsed time
                toast.error("End time must be greater than the current elapsed time");
            } else {
                endTimeRef.current = newEndTimeSeconds; // Set the end time
                toast.success(`Recording end time set to ${minutes} minutes`);
            }
        }
    };

    const workerRef = useRef<Worker | null>(null);



    const saveAllDataAsZip = async () => {
        try {
            if (workerRef.current) {
                workerRef.current.postMessage({ action: 'saveAsZip', canvasCount, selectedChannels });

                workerRef.current.onmessage = async (event) => {
                    const { zipBlob, error } = event.data;

                    if (zipBlob) {
                        saveAs(zipBlob, 'ORIC.zip');
                    } else if (error) {
                        console.error(error);
                    }
                };
            }
        } catch (error) {
            console.error('Error while saving ZIP file:', error);
        }
    };

    // Function to handle saving data by filename
    const saveDataByFilename = async (filename: string, canvasCount: number, selectChannel: number[]) => {
        if (workerRef.current) {
            workerRef.current.postMessage({ action: "saveDataByFilename", filename, canvasCount, selectChannel });
            workerRef.current.onmessage = (event) => {
                const { blob, error } = event.data;

                if (blob) {
                    saveAs(blob, filename); // FileSaver.js
                    toast.success("File downloaded successfully.");
                } else (error: any) => {
                    console.error("Worker error:", error);
                    toast.error(`Error during file download: ${error.message}`);
                }
            };

            workerRef.current.onerror = (error) => {
                console.error("Worker error:", error);
                toast.error("An unexpected worker error occurred.");
            };
        } else {
            console.error("Worker reference is null.");
            toast.error("Worker is not available.");
        }

    };
    const startLSL = async () => {
        const sps = 250// can come from user input
        await core.invoke("start_lsl_stream", { sps });
    };
    const wsRef = useRef<WebSocket | null>(null);
    const connectToDevice = () => {
        wsRef.current = new WebSocket('ws://oric.local:81');
        console.log("clicked");
        startLSL();
        wsRef.current.onopen = function () {
            console.log('WebSocket connection established');
            const channelConfig = [];
            channelConfig.push(
                { command: "reset", parameters: [] },
                { command: "sdatac", parameters: [] },
                { command: "wreg", parameters: [0x01, sps] },
            );
            // Check if any channel has channelInput === "test"
            const hasTestInput = channelConfigs.some(config => config.channelInput === "test");

            // Use 0xD0 if any channel is in test mode, otherwise 0xC0
            channelConfig.push(
                { command: "wreg", parameters: [0x02, hasTestInput ? 0xD0 : 0xC0] },
                { command: "wreg", parameters: [0x03, 0xEC] },
            );
            console.log(sps);

            for (let i = 5; i < 5 + channels; i++) {
                const { powerdown, srb2, pgaGain, channelInput } = channelConfigs[i - 5];

                if (!powerdown) {
                    const powerD = powerdown ? 0b1 : 0b0;
                    const gainValue = pgaGain; // Convert binary string to a number
                    const srb2Value = srb2 ? 0b1 : 0b0;
                    const inputType = channelInput === "Normal" ? 0b000 : 0b101;
                    const value = ((powerD << 7) | (gainValue << 4) | (srb2Value << 3) | inputType) & 0xFF;
                    console.log(powerD, gainValue, srb2Value, inputType, value);
                    // Directly use the calculated value instead of converting from binary string
                    channelConfig.push({ command: "wreg", parameters: [eval(`0x${i.toString(16).padStart(2, '0')}`), value] });
                }
                else {
                    // Use the decimal value directly (0x61 is 97 in decimal)
                    channelConfig.push({ command: "wreg", parameters: [eval(`0x0${i}`), 0x61] });
                }
            }
            channelConfig.push(
                { command: "status", parameters: [] },
                { command: "rdatac", parameters: [] },
                { command: "start", parameters: [] }

            );
            console.log(channelConfig);
            channelConfig.forEach((cmd) => wsRef.current?.send(JSON.stringify(cmd)));
        };
        Connection(true);
        setIsDeviceConnected(true);
        onPauseChange(true);
        setIsDisplay(true);
        setCanvasCount(1);
        maxCanvasElementCountRef.current = 8;
        isDeviceConnectedRef.current = true;
        wsRef.current.onmessage = function (event: MessageEvent) {
            if (event.data instanceof Blob) {
                const reader = new FileReader();
                reader.onload = function () {

                    try {
                        const buffer = new Uint8Array(reader.result as ArrayBuffer);
                        parseEEGData(buffer);
                    } catch (error) {
                        console.error('Error processing EEG data:', error);
                    }
                };
                reader.readAsArrayBuffer(event.data);
            } else if (typeof event.data === 'string') {
                console.log('WebSocket message:', event.data);
            } else {
                console.error('Unexpected data format:', event.data);
            }
        };

        wsRef.current.onclose = function () {
            console.log('WebSocket connection closed');
        };

        wsRef.current.onerror = function (error: Event) {
            console.error('WebSocket error:', error);
        };
    };
    const Filter = Array.from({ length: 8 }, () => new five());
    const EXGFilters = Array.from({ length: 8 }, () => new EXGFilter());
    const notchFilters = Array.from({ length: 8 }, () => new Notch());
    notchFilters.forEach((filter) => {
        filter.setbits(currentSamplingRate); // Set the bits value for all instances
    });
    EXGFilters.forEach((filter) => {
        filter.setbits(currentSamplingRate); // Set the bits value for all instances
    });
    Filter.forEach((filter) => {
        filter.setbits(currentSamplingRate); // Set the bits value for all instances
    });
    // Store data between refresh intervals
    const SAMPLE_RATE = 250; // Hz
    const REFRESH_RATE = 50; // Hz
    const REFRESH_INTERVAL_MS = 1000 / REFRESH_RATE; // 20ms
    const SAMPLES_PER_BATCH = currentSamplingRate / 50;

    let sampleBuffer: number[][] = [];
    let lastSendTime = 0;

    const parseEEGData = (buffer: Uint8Array) => {
        const blockSize = 32;
        const now = performance.now();

        // Process all incoming blocks
        for (let blockLocation = 0; blockLocation < buffer.length; blockLocation += blockSize) {
            const block = buffer.slice(blockLocation, blockLocation + blockSize);
            const channelData: number[] = []; // Array to store the extracted channel data

            // Process all 8 channels
            for (let channel = 0; channel < 8; channel++) {
                const offset = 8 + channel * 3;
                let sample = (block[offset] << 16) | (block[offset + 1] << 8) | block[offset + 2];
                // Check if channelInput is "test" for this channel
                const isTestInput = channelConfigs[channel]?.channelInput === "test";
                // Only apply filters if not in test mode
                const value = isTestInput
                    ? sample - Math.pow(2, 23) // Use raw sample if in test mode
                    : Filter[channel].process(sample); // Apply filter if not in test mode

                channelData.push(
                    notchFilters[channel].process(
                        EXGFilters[channel].process(
                            value,
                            appliedEXGFiltersRef.current[channel]
                        ),
                        appliedFiltersRef.current[channel]
                    )
                );
            }
            core.invoke('start_streaming', { channelData: channelData })
                .then((response) => {
                    console.log('Data sent to backend successfully:', response);
                })
                .catch((error) => {
                    console.error('Error sending data to backend:', error);
                });
            // Store EVERY sample
            datastream(channelData);
        }
    };

    const handlecustomTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Update custom time input with only numeric values
        setCustomTimeInput(e.target.value.replace(/\D/g, ""));
    };

    const handlecustomTimeInputSet = () => {
        // Parse and validate the custom time input
        const time = parseInt(customTimeInput, 10);

        if (time > 0) {
            handleTimeSelection(time); // Proceed with valid time
        } else {
            toast.error("Please enter a valid time in minutes"); // Show error for invalid input
        }

        // Clear the input field after handling
        setCustomTimeInput("");
    };


    const getFileCountFromIndexedDB = async (): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            if (workerRef.current) {
                workerRef.current.postMessage({ action: 'getFileCountFromIndexedDB' });

                workerRef.current.onmessage = (event) => {
                    if (event.data.allData) {
                        resolve(event.data.allData);
                    } else if (event.data.error) {
                        reject(event.data.error);
                    }
                };

                workerRef.current.onerror = (error) => {
                    reject(`Error in worker: ${error.message}`);
                };
            } else {
                reject('Worker is not initialized');
            }
        });
    };



    const appliedFiltersRef = React.useRef<{ [key: number]: number }>({});
    const appliedEXGFiltersRef = React.useRef<{ [key: number]: number }>({});
    const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
    const [, forceEXGUpdate] = React.useReducer((x) => x + 1, 0);

    const removeEXGFilter = (channelIndex: number) => {
        delete appliedEXGFiltersRef.current[channelIndex]; // Remove the filter for the channel
        forceEXGUpdate(); // Trigger re-render

    };

    // Function to handle frequency selection
    const handleFrequencySelectionEXG = (channelIndex: number, frequency: number) => {
        appliedEXGFiltersRef.current[channelIndex] = frequency; // Update the filter for the channel
        forceEXGUpdate(); //Trigger re-render

    };

    // Function to set the same filter for all channels
    const applyEXGFilterToAllChannels = (channels: number[], frequency: number) => {
        channels.forEach((channelIndex) => {
            appliedEXGFiltersRef.current[channelIndex] = frequency; // Set the filter for the channel
        });
        forceEXGUpdate(); // Trigger re-render

    };
    // Function to remove the filter for all channels
    const removeEXGFilterFromAllChannels = (channels: number[]) => {
        channels.forEach((channelIndex) => {
            delete appliedEXGFiltersRef.current[channelIndex]; // Remove the filter for the channel
        });
        forceEXGUpdate(); // Trigger re-render

    };
    const removeNotchFilter = (channelIndex: number) => {
        delete appliedFiltersRef.current[channelIndex]; // Remove the filter for the channel
        forceUpdate(); // Trigger re-render
    };
    // Function to handle frequency selection
    const handleFrequencySelection = (channelIndex: number, frequency: number) => {
        appliedFiltersRef.current[channelIndex] = frequency; // Update the filter for the channel
        forceUpdate(); //Trigger re-render
    };

    // Function to set the same filter for all channels
    const applyFilterToAllChannels = (channels: number[], frequency: number) => {
        channels.forEach((channelIndex) => {
            appliedFiltersRef.current[channelIndex] = frequency; // Set the filter for the channel
        });
        forceUpdate(); // Trigger re-render
    };

    // Function to remove the filter for all channels
    const removeNotchFromAllChannels = (channels: number[]) => {
        channels.forEach((channelIndex) => {
            delete appliedFiltersRef.current[channelIndex]; // Remove the filter for the channel
        });
        forceUpdate(); // Trigger re-render
    };
    useEffect(() => {
        setSelectedChannels(selectedChannels)

    }, [selectedChannels]);

    const handleRecord = async () => {
        if (isRecordingRef.current) {
            // Stop the recording if it is currently active
            stopRecording();

        } else {
            // Start a new recording session
            isRecordingRef.current = true;
            const now = new Date();
            recordingStartTimeRef.current = Date.now();
            setRecordingElapsedTime(Date.now());
            setIsRecordButtonDisabled(true);

            const filename = `ORIC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-` +
                `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.csv`;

            currentFileNameRef.current = filename;
        }
    };

    const stopRecording = async () => {
        if (!recordingStartTimeRef) {
            toast.error("Recording start time was not captured.");
            return;
        }
        isRecordingRef.current = false;
        setRecordingElapsedTime(0);
        setIsRecordButtonDisabled(false);
        setIsDisplay(true);

        recordingStartTimeRef.current = 0;
        existingRecordRef.current = undefined;
        // Re-fetch datasets from IndexedDB after recording stops
        const fetchData = async () => {
            const data = await getFileCountFromIndexedDB();
            setDatasets(data); // Update datasets with the latest data
        };
        // Call fetchData after stopping the recording
        fetchData();
    };

    // Function to format time from seconds into a "MM:SS" string format
    const formatTime = (milliseconds: number): string => {
        const date = new Date(milliseconds);
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };

    const handleDisconnect = () => {
        if (wsRef.current) {
            // Send command to stop data transmission if needed
            const stopCommand: WebSocketCommand = { command: 'sdatac', parameters: [] };
            wsRef.current.send(JSON.stringify(stopCommand));

            // Close the WebSocket connection
            wsRef.current.close();
            wsRef.current = null;
            Connection(false);
            setIsDeviceConnected(false);
            setIsDisplay(false);
            maxCanvasElementCountRef.current = 8;
            isDeviceConnectedRef.current = true;
            console.log('WebSocket disconnected');
        }
    };
    return (
        <div className="flex-none items-center justify-center pb-4 bg-g z-10">
            {/* Left-aligned section */}
            <div className="absolute left-4 flex items-center mx-0 px-0 space-x-1">
                {isRecordingRef.current && (
                    <div className="flex items-center space-x-1 w-min">
                        <button className="flex items-center justify-center px-1 py-2   select-none min-w-20 bg-primary text-destructive whitespace-nowrap rounded-xl"
                        >
                            {formatTime(recordingElapsedTime)}
                        </button>
                        <Separator orientation="vertical" className="bg-primary h-9 " />
                        <div>
                            <Popover
                                open={isEndTimePopoverOpen}
                                onOpenChange={setIsEndTimePopoverOpen}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        className="flex items-center justify-center px-1 py-2   select-none min-w-10  text-destructive whitespace-nowrap rounded-xl"
                                        variant="destructive"
                                    >
                                        {endTimeRef.current === null ? (
                                            <Infinity className="h-5 w-5 text-primary" />
                                        ) : (
                                            <div className="text-sm text-primary font-medium">
                                                {formatTime(endTimeRef.current)}
                                            </div>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-4 mx-4">
                                    <div className="flex flex-col space-y-4">
                                        <div className="text-sm font-medium">
                                            Set End Time (minutes)
                                        </div>
                                        <div className="grid grid-cols-4 gap-2">
                                            {[1, 10, 20, 30].map((time) => (
                                                <Button
                                                    key={time}
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleTimeSelection(time)}
                                                >
                                                    {time}
                                                </Button>
                                            ))}
                                        </div>
                                        <div className="flex space-x-2 items-center">
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                placeholder="Custom"
                                                value={customTimeInput}
                                                onBlur={handlecustomTimeInputSet}
                                                onKeyDown={(e) =>
                                                    e.key === "Enter" && handlecustomTimeInputSet()
                                                }
                                                onChange={handlecustomTimeInputChange}
                                                className="w-20"
                                            />
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleTimeSelection(null)}
                                            >
                                                <Infinity className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                )}
            </div>

            {/* Center-aligned buttons */}
            <div className="flex gap-3 items-center justify-center">
                {/* Connection button with tooltip */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Popover open={open} onOpenChange={setOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        className="flex items-center gap-1 py-2 px-4 rounded-xl font-semibold"
                                        onClick={() => (isDeviceConnected ? handleDisconnect() : connectToDevice())}
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader size={17} className="animate-spin" />
                                                Connecting...
                                            </>
                                        ) : isDeviceConnected ? (
                                            <>
                                                Disconnect
                                                <CircleX size={17} />
                                            </>
                                        ) : (
                                            <>
                                                ORIC Visualizer
                                                <Cable size={17} />
                                            </>
                                        )}
                                    </Button>
                                </PopoverTrigger>
                            </Popover>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>{isDeviceConnected ? "Disconnect Device" : "Connect Device"}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>



                {isDeviceConnected && (
                    <Popover
                        open={isFilterPopoverOpen}
                        onOpenChange={setIsFilterPopoverOpen}
                    >
                        <PopoverTrigger asChild>
                            <Button
                                className="flex items-center justify-center px-3 py-2 select-none min-w-12 whitespace-nowrap rounded-xl"
                                disabled={isPauseSate}
                            >
                                Filter
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-50 p-4 mx-4 mb-2">
                            <div className="flex flex-col max-h-80 overflow-y-auto">
                                <div className="flex items-center pb-2 ">
                                    {/* Filter Name */}
                                    <div className="text-sm font-semibold w-12"><ReplaceAll size={20} /></div>
                                    {/* Buttons */}
                                    <div className="flex space-x-2">
                                        <div className="flex items-center border border-input rounded-xl mx-0 px-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeEXGFilterFromAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i))}
                                                className={`rounded-xl rounded-r-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === 0
                                                        ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <CircleOff size={17} />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 4)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 4)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <BicepsFlexed size={17} />
                                            </Button> <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 3)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 3)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <Brain size={17} />
                                            </Button> <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 1)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 1)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <Heart size={17} />
                                            </Button> <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyEXGFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 2)}
                                                className={`rounded-xl rounded-l-none border-0
                        ${Object.keys(appliedEXGFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedEXGFiltersRef.current).every((value) => value === 2)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <Eye size={17} />
                                            </Button>
                                        </div>
                                        <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => removeNotchFromAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i))}
                                                className={`rounded-xl rounded-r-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === 0
                                                        ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                <CircleOff size={17} />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 1)}
                                                className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedFiltersRef.current).every((value) => value === 1)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                50Hz
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => applyFilterToAllChannels(Array.from({ length: maxCanvasElementCountRef.current }, (_, i) => i), 2)}
                                                className={`rounded-xl rounded-l-none border-0
                          ${Object.keys(appliedFiltersRef.current).length === maxCanvasElementCountRef.current && Object.values(appliedFiltersRef.current).every((value) => value === 2)
                                                        ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                        : "bg-white-500" // Active background
                                                    }`}
                                            >
                                                60Hz
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col space-y-2">
                                    {channelNames.map((filterName, index) => (
                                        <div key={filterName} className="flex items-center">
                                            {/* Filter Name */}
                                            <div className="text-sm font-semibold w-12">{filterName}</div>
                                            {/* Buttons */}
                                            <div className="flex space-x-2">
                                                <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => removeEXGFilter(index)}
                                                        className={`rounded-xl rounded-r-none border-l-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === undefined
                                                                ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <CircleOff size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 4)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 4
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <BicepsFlexed size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 3)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                      ${appliedEXGFiltersRef.current[index] === 3
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <Brain size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 1)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 1
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <Heart size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelectionEXG(index, 2)}
                                                        className={`rounded-xl rounded-l-none border-0
                                                        ${appliedEXGFiltersRef.current[index] === 2
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <Eye size={17} />
                                                    </Button>
                                                </div>
                                                <div className="flex border border-input rounded-xl items-center mx-0 px-0">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => removeNotchFilter(index)}
                                                        className={`rounded-xl rounded-r-none border-0
                                                        ${appliedFiltersRef.current[index] === undefined
                                                                ? "bg-red-700 hover:bg-white-500 hover:text-white text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        <CircleOff size={17} />
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelection(index, 1)}
                                                        className={`flex items-center justify-center px-3 py-2 rounded-none select-none border-0
                                                        ${appliedFiltersRef.current[index] === 1
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white" // Disabled background
                                                                : "bg-white-500" // Active background
                                                            }`}
                                                    >
                                                        50Hz
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleFrequencySelection(index, 2)}
                                                        className={
                                                            `rounded-xl rounded-l-none border-0 ${appliedFiltersRef.current[index] === 2
                                                                ? "bg-green-700 hover:bg-white-500 text-white hover:text-white "
                                                                : "bg-white-500 animate-fade-in-right"
                                                            }`
                                                        }
                                                    >
                                                        60Hz
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}
                {!isDeviceConnected && (

                    <Popover open={isSettingOpen} onOpenChange={setIsSettingOpen}>
                        <PopoverTrigger asChild>
                            <Button
                                className="flex items-center justify-center px-3 py-2 select-none min-w-12 whitespace-nowrap rounded-xl"
                                disabled={isDeviceConnected}
                            >
                                Config
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="center" className="w-full item-center p-0">
                            <div className="flex flex-col w-full max-h-100 max-w-200 overflow-y-auto">
                                <div className="flex items-center justify-center">
                                    <div className="flex flex-col flex-[1_1_0%] min-h-80 bg-[#000] p-6 rounded-2xl relative max-w-[90vw]">
                                        <div className="mb-4 flex">
                                            <label className="block text-xl font-semibold text-white mb-2">
                                                Choose Sampling Rate
                                            </label>
                                            <div className="relative">
                                                <select
                                                    id="sps-selector"
                                                    value={sps}
                                                    onChange={handleSpsChange}
                                                    className="block mx-4 px-4 py-2 text-black bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg focus:outline-none focus:ring-4 focus:ring-indigo-500 transition-all duration-300 ease-in-out"
                                                >
                                                    <option value={0x96} className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">250 SPS</option>
                                                    <option value={0x95} className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">500 SPS</option>
                                                    <option value={0x94} className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">1000 SPS</option>
                                                    <option value={0x93} className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">2000 SPS</option>
                                                    <option value={0x92} className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">4000 SPS</option>
                                                    <option value={0x91} className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">8000 SPS</option>
                                                    <option value={0x90} className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">16000 SPS</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between mb-4">
                                            <button
                                                onClick={() => setCurrentChannel(prev => Math.max(0, prev - 1))}
                                                disabled={currentChannel === 0}
                                                className={`px-4 py-2 rounded-lg ${currentChannel === 0 ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'} text-white transition-colors`}
                                            >
                                                <ArrowLeftIcon></ArrowLeftIcon>
                                            </button>

                                            <h2 className="text-xl font-semibold text-white">
                                                Channel {currentChannel + 1} Configuration
                                            </h2>

                                            <button
                                                onClick={() => setCurrentChannel(prev => Math.min(channels - 1, prev + 1))}
                                                disabled={currentChannel === channels - 1}
                                                className={`px-4 py-2 rounded-lg ${currentChannel === channels - 1 ? 'bg-gray-500 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'} text-white transition-colors`}
                                            >
                                                <ArrowRightIcon></ArrowRightIcon>
                                            </button>
                                        </div>

                                        {channelConfigs.length > 0 && (
                                            <div className="bg-white rounded-md p-4 shadow w-full">
                                                <div className="mb-3 flex items-center">
                                                    <label className="text-sm font-medium text-gray-700 mr-2">Channel Power Down</label>
                                                    <input
                                                        type="checkbox"
                                                        checked={channelConfigs[currentChannel].powerdown}
                                                        onChange={(e) =>
                                                            handleChannelConfigChange(currentChannel, "powerdown", e.target.checked)
                                                        }
                                                        className="rounded border-gray-300 focus:ring-indigo-500"
                                                    />
                                                </div>
                                                <div className="mb-3 flex items-center">
                                                    <label className="text-sm font-medium text-gray-700 mr-2">SRB2:</label>
                                                    <input
                                                        type="checkbox"
                                                        checked={channelConfigs[currentChannel].srb2}
                                                        onChange={(e) =>
                                                            handleChannelConfigChange(currentChannel, "srb2", e.target.checked)
                                                        }
                                                        className="rounded border-gray-300 focus:ring-indigo-500"
                                                    />
                                                </div>

                                                <div className="mb-3">
                                                    <label className="block text-sm font-medium text-gray-700">PGA Gain:</label>
                                                    <select
                                                        value={channelConfigs[currentChannel].pgaGain}
                                                        onChange={(e) =>
                                                            handleChannelConfigChange(currentChannel, "pgaGain", e.target.value)
                                                        }
                                                        className="mt-1 block w-full text-black rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                    >
                                                        {[
                                                            { binary: 0b000, display: 1 },
                                                            { binary: 0b001, display: 2 },
                                                            { binary: 0b010, display: 4 },
                                                            { binary: 0b011, display: 6 },
                                                            { binary: 0b100, display: 8 },
                                                            { binary: 0b101, display: 12 },
                                                            { binary: 0b110, display: 24 },
                                                        ].map(({ binary, display }) => (
                                                            <option key={binary} value={binary}>
                                                                {display}x
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="mb-3">
                                                    <label className="block text-sm font-medium text-gray-700">Channel Input:</label>
                                                    <select
                                                        value={channelConfigs[currentChannel].channelInput}
                                                        onChange={(e) =>
                                                            handleChannelConfigChange(currentChannel, "channelInput", e.target.value)
                                                        }
                                                        className="mt-1 block w-full text-black rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                                    >
                                                        <option value="Normal">Normal Electrode</option>
                                                        <option value="test">Test Signal</option>
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                )}

                {isDeviceConnected && (
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button className="flex items-center justify-center select-none whitespace-nowrap rounded-lg" >
                                <Settings size={16} />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[30rem] p-4 rounded-md shadow-md text-sm">
                            <TooltipProvider>
                                <div className={`space-y-6 ${!isDisplay ? "flex justify-center" : ""}`}>
                                    {/* Channel Selection */}
                                    {isDisplay && !isRecordingRef.current && (
                                        <div className="flex items-center justify-center rounded-lg ">
                                            <div className="w-full">
                                                {/* Channels Count & Select All Button */}
                                                <div className="flex items-center justify-between " >
                                                    <h3 className="text-xs font-semibold text-gray-500">
                                                        <span className="font-bold text-gray-600">Channels Count:</span> {selectedChannels.length}
                                                    </h3>
                                                    {!(selectedChannels.length === maxCanvasElementCountRef.current && manuallySelected) && (
                                                        <button
                                                            onClick={handleSelectAllToggle}
                                                            className={`px-4 py-1 text-xs font-light rounded-lg transition m-2 ${isSelectAllDisabled
                                                                ? "text-gray-400 bg-gray-200 dark:bg-gray-700 dark:text-gray-500 cursor-not-allowed"
                                                                : "text-white bg-black hover:bg-gray-700 dark:bg-white dark:text-black dark:border dark:border-gray-500 dark:hover:bg-primary/70"
                                                                }`}
                                                            disabled={isSelectAllDisabled}
                                                        >
                                                            {isAllEnabledChannelSelected ? "RESET" : "Select All"}
                                                        </button>
                                                    )}
                                                </div>
                                                {/* Channel Buttons Grid */}
                                                <div id="button-container" className="relative space-y-2 rounded-lg">
                                                    {Array.from({ length: 2 }).map((_, container) => (
                                                        <div key={container} className="grid grid-cols-8 gap-2">
                                                            {Array.from({ length: 8 }).map((_, col) => {
                                                                const index = container * 8 + col;
                                                                const isChannelDisabled = index >= maxCanvasElementCountRef.current;
                                                                const isSelected = selectedChannels.includes(index);
                                                                const buttonStyle = isChannelDisabled
                                                                    ? isDarkModeEnabled
                                                                        ? { backgroundColor: "#030c21", color: "gray" }
                                                                        : { backgroundColor: "#e2e8f0", color: "gray" }
                                                                    : isSelected
                                                                        ? { backgroundColor: getCustomColor(index, activeTheme), color: "white" }
                                                                        : { backgroundColor: "white", color: "black" };
                                                                const isFirstInRow = col === 0;
                                                                const isLastInRow = col === 7;
                                                                const isFirstContainer = container === 0;
                                                                const isLastContainer = container === 1;
                                                                const roundedClass = `
                                                                ${isFirstInRow && isFirstContainer ? "rounded-tl-lg" : ""} 
                                                                ${isLastInRow && isFirstContainer ? "rounded-tr-lg" : ""} 
                                                                ${isFirstInRow && isLastContainer ? "rounded-bl-lg" : ""} 
                                                                ${isLastInRow && isLastContainer ? "rounded-br-lg" : ""}
                                                                     `;

                                                                return (
                                                                    <button
                                                                        key={index}
                                                                        onClick={() => !isChannelDisabled && toggleChannel(index)}
                                                                        disabled={isChannelDisabled}
                                                                        style={buttonStyle}
                                                                        className={`w-full h-8 text-xs font-medium py-1 border border-gray-300 dark:border-gray-600 transition-colors duration-200 ${roundedClass}`}
                                                                    >
                                                                        {`CH${index + 1}`}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Zoom Controls */}
                                    <div className={`relative w-full flex flex-col ${!isDisplay ? "" : "items-start"} text-sm`}>
                                        {/* Zoom Level label positioned at top left with margin/padding */}
                                        <p className="text-xs justify-start font-semibold text-gray-500 ">
                                            <span className="font-bold text-gray-600">Zoom Level:</span> {Zoom}x
                                        </p>
                                        <div className="relative w-[28rem] flex items-center rounded-lg py-2 border border-gray-300 dark:border-gray-600 mb-4">
                                            {/* Button for setting Zoom to 1 */}
                                            <button
                                                className="text-gray-700 dark:text-gray-400 mx-1 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                onClick={() => SetZoom(1)}
                                            >
                                                1
                                            </button>

                                            <input
                                                type="range"
                                                min="1"
                                                max="2000"
                                                value={Zoom}
                                                onChange={(e) => SetZoom(Number(e.target.value))}
                                                style={{
                                                    background: `linear-gradient(to right, rgb(101, 136, 205) ${((Zoom - 1) / 1999) * 100}%, rgb(165, 165, 165) ${((Zoom - 1) / 1999) * 100}%)`,
                                                }}
                                                className="flex-1 h-[0.15rem] rounded-full appearance-none bg-gray-800 focus:outline-none focus:ring-0 slider-input"
                                            />


                                            {/* Button for setting Zoom to 10 */}
                                            <button
                                                className="text-gray-700 dark:text-gray-400 mx-2 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                onClick={() => SetZoom(2000)}
                                            >
                                                2000                                            </button>
                                            <style jsx>{` input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 15px; height: 15px;
                                            background-color: rgb(101, 136, 205); border-radius: 50%; cursor: pointer; } `}</style>
                                        </div>
                                    </div>

                                    {/* Time-Base Selection */}
                                    {isDisplay && (
                                        <div className="relative w-full flex flex-col items-start  text-sm">
                                            <p className="text-xs font-semibold text-gray-500 ">
                                                <span className="font-bold text-gray-600">Time Base:</span> {timeBase} Seconds
                                            </p>
                                            <div className="relative w-[28rem] flex items-center rounded-lg py-2 border border-gray-300 dark:border-gray-600">
                                                {/* Buttons & Slider */}
                                                <button
                                                    className="text-gray-700 dark:text-gray-400 mx-1 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    onClick={() => setTimeBase(1)}
                                                >
                                                    1
                                                </button>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="10"
                                                    value={timeBase}
                                                    onChange={(e) => setTimeBase(Number(e.target.value))}
                                                    style={{
                                                        background: `linear-gradient(to right, rgb(101, 136, 205) ${((timeBase - 1) / 9) * 100}%, rgb(165, 165, 165) ${((timeBase - 1) / 9) * 11}%)`,
                                                    }}
                                                    className="flex-1 h-[0.15rem] rounded-full appearance-none bg-gray-200 focus:outline-none focus:ring-0 slider-input"
                                                />
                                                <button
                                                    className="text-gray-700 dark:text-gray-400 mx-2 px-2 py-1 border rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    onClick={() => setTimeBase(10)}
                                                >
                                                    10
                                                </button>
                                                <style jsx>{` input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none;appearance: none; width: 15px; height: 15px;
                                                background-color: rgb(101, 136, 205); border-radius: 50%; cursor: pointer; }`}</style>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </TooltipProvider>
                        </PopoverContent>
                    </Popover>
                )}
            </div>
        </div>
    );
};

export default Connection;