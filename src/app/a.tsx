"use client";
import { WebglPlot, ColorRGBA, WebglLine } from "webgl-plot";
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTheme } from "next-themes";
import { Settings } from 'lucide-react';

const SAMPLE_RATE = 250; // 250 samples per second
const BUFFER_SIZE = SAMPLE_RATE * 5; // Store 5 seconds of data
const CHANNELS = 8; // Number of EEG channels


const EEGMonitor: React.FC = () => {
  const ws = useRef<WebSocket | null>(null);
  // ////
  const [samplingRate, setSamplingRate] = useState<number>(250);
  const [numChannels, setNumChannels] = useState<number>(8);
  const [data, setData] = useState<number[][]>([]);
  const [wglPlots, setWglPlots] = useState<WebglPlot[]>([]);
  const [lines, setLines] = useState<WebglLine[]>([]);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const numXRef = useRef<number>(3000); // To track the calculated value
  const [canvases, setCanvases] = useState<HTMLCanvasElement[]>([]);
  const [gScaleY, setGScaleY] = useState(1); // Initial scale value
  const [goffset, setoffset] = useState(1); // Initial scale value


  const linesRef = useRef<WebglLine[]>([]);
  const sweepPositions = useRef<number[]>(new Array(8).fill(0));
  const currentSweepPos = useRef<number[]>(new Array(8).fill(0));

  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Popup state

  const buffers = useRef<number[][]>(
    Array.from({ length: CHANNELS }, () => [])
  ); // Circular buffer for EEG data
  const { theme } = useTheme();

  const toggleSettings = () => setIsSettingsOpen((prev) => !prev);

  const createCanvases = () => {
    if (!canvasContainerRef.current) return;

    // Clean up all existing canvases and their WebGL contexts
    while (canvasContainerRef.current.firstChild) {
      const firstChild = canvasContainerRef.current.firstChild;
      if (firstChild instanceof HTMLCanvasElement) {
        const gl = firstChild.getContext("webgl");
        if (gl) {
          const loseContext = gl.getExtension("WEBGL_lose_context");
          if (loseContext) {
            loseContext.loseContext();
          }
        }
      }
      canvasContainerRef.current.removeChild(firstChild);
    }

    setCanvases([]);
    setWglPlots([]);
    linesRef.current = [];
    const newCanvases = [];
    const newWglPlots = [];
    const newLines = [];


    // // Create grid lines
    const canvasWrapper = document.createElement("div");
    canvasWrapper.className = "absolute inset-0"; // Make the wrapper fill the parent container
    const opacityDarkMajor = "0.2"; // Opacity for every 5th line in dark theme
    const opacityDarkMinor = "0.05"; // Opacity for other lines in dark theme
    const opacityLightMajor = "0.4"; // Opacity for every 5th line in light theme
    const opacityLightMinor = "0.1"; // Opacity for other lines in light theme
    const distanceminor = samplingRate * 0.04;
    const numGridLines = 250 * 4 / distanceminor;
    for (let j = 1; j < numGridLines; j++) {
      const gridLineX = document.createElement("div");
      gridLineX.className = "absolute bg-[rgb(128,128,128)]";
      gridLineX.style.width = "1px";
      gridLineX.style.height = "100%";
      const divPoint = (j / numGridLines) * 100
      const a = parseFloat(divPoint.toFixed(3));
      gridLineX.style.left = `${a}%`
      gridLineX.style.top = "0";
      gridLineX.style.opacity = j % 5 === 0 ? (theme === "dark" ? opacityDarkMajor : opacityLightMajor) : (theme === "dark" ? opacityDarkMinor : opacityLightMinor);

      // Append grid lines to the wrapper
      canvasWrapper.appendChild(gridLineX);
    }
    const horizontalline = 50;
    for (let j = 1; j < horizontalline; j++) {
      const gridLineY = document.createElement("div");
      gridLineY.className = "absolute bg-[rgb(128,128,128)]";
      gridLineY.style.height = "1px";
      gridLineY.style.width = "100%";
      const distance = (j / horizontalline) * 100
      const distancetop = parseFloat(distance.toFixed(3));
      gridLineY.style.top = `${distancetop}%`;
      gridLineY.style.left = "0";
      gridLineY.style.opacity = j % 5 === 0 ? (theme === "dark" ? opacityDarkMajor : opacityLightMajor) : (theme === "dark" ? opacityDarkMinor : opacityLightMinor);

      // Append grid lines to the wrapper
      canvasWrapper.appendChild(gridLineY);
    }

    canvasContainerRef.current.appendChild(canvasWrapper);
    for (let i = 0; i < numChannels; i++) {
      const canvasWrapper = document.createElement("div");
      canvasWrapper.className = "canvas-container relative flex-[1_1_0%]"; // Add relative positioning for absolute grid positioning

      const canvas = document.createElement("canvas");
      canvas.id = `canvas${i + 1}`;
      canvas.width = canvasContainerRef.current.clientWidth;
      const canvasHeight = (canvasContainerRef.current.clientHeight / numChannels);
      canvas.height = canvasHeight;
      canvas.className = "w-full h-full block rounded-xl";

      // Create a badge for the channel number
      const badge = document.createElement("div");
      badge.className = "absolute text-gray-500 text-sm rounded-full p-2 m-2";
      badge.innerText = `CH${i + 1}`;

      // Append the canvas and badge to the container
      canvasWrapper.appendChild(badge);
      canvasWrapper.appendChild(canvas);
      canvasContainerRef.current.appendChild(canvasWrapper);

      newCanvases.push(canvas);
      const wglp = new WebglPlot(canvas);
      newWglPlots.push(wglp);
      const line = new WebglLine(new ColorRGBA(1, 0.286, 0.529, 1), 1000);
      wglp.gOffsetY = 0;
      line.offsetY = 0;
      line.lineSpaceX(-1, 2 / 1000);
      wglp.gScaleY = gScaleY;

      wglp.addLine(line);
      newLines.push(line);
    }

    linesRef.current = newLines;
    setCanvases(newCanvases);
    setWglPlots(newWglPlots);
    setLines(newLines);
  };

  function autoScale(data: number[], scaleSmoothing: number = 0.125): { min: number; max: number } {
    let minValue = Math.min(...data);
    let maxValue = Math.max(...data);

    // Apply scaling with padding
    const maxValueScale = 1.1;
    const minValueScale = 0.9;
    const targetMax = maxValue * maxValueScale;
    const targetMin = minValue * minValueScale;

    // Smooth the scaling
    let currentMax = maxValue;
    let currentMin = minValue;
    currentMax += scaleSmoothing * (targetMax - currentMax);
    currentMin += scaleSmoothing * (targetMin - currentMin);

    return { min: currentMin, max: currentMax };
  }


  // const updatePlots = useCallback(
  //   (data: number[]) => {
  //     wglPlots.forEach((wglp, index) => {
  //       if (wglp) {
  //         const centerY = 0; // Center of the Y-axis range (-1 to 1)

  //         // Get the previous scale, defaulting to 1 if not set
  //         const previousScaleY = wglp.gScaleY || 1;

  //         // Calculate the scale ratio (how much the scale has changed)
  //         const scaleRatio = gScaleY / previousScaleY;

  //         // Calculate the new offset to maintain the center position
  //         const newOffsetY = scaleRatio;
  //         // console.log("a", newOffsetY)
  //         // Update the scale and offset
  //         wglp.gScaleY = gScaleY;
  //         wglp.gOffsetY = goffset;
  //         // console.log(gScaleY);
  //         const yMin = -100;  // Minimum value of Y-axis
  //         // const yMax = 100;   // Maximum value of Y-axis

  //         // // Calculate scale factor
  //         // wglp.gScaleY = 2 / (yMax - yMin);

  //         // // Calculate offset
  //         // wglp.gOffsetY = -(yMax + yMin) / 2;
  //         try {
  //         } catch (error) {
  //           console.error(
  //             `Error setting gScaleY for WebglPlot instance at index ${index}:`,
  //             error
  //           );
  //         }
  //       } else {
  //         console.warn(`WebglPlot instance at index ${index} is undefined.`);
  //       }
  //     });

  //     linesRef.current.forEach((line, i) => {
  //       let bitsPoints = Math.pow(2, 24);

  //       const channelDataBuffer = buffers.current[i];
  //       const min = Math.min(...channelDataBuffer);
  //       const max = Math.max(...channelDataBuffer);

  //  console.log(min,max);

  //       const yRange = max - min || 1; // Avoid division by zero
  //       const yValue =((data[i] - min) / yRange) * 2 - 1;
  //       // console.log(a);
  //       // console.log(yValue);

  //       // Use a separate sweep position for each line
  //       currentSweepPos.current[i] = sweepPositions.current[i];
  //       // Plot the new data at the current sweep position
  //       line.setY(currentSweepPos.current[i] % line.numPoints, yValue);

  //       // Clear the next point to create a gap (optional, for visual effect)
  //       const clearPosition = Math.ceil((currentSweepPos.current[i] + (numXRef.current / 100)) % line.numPoints);
  //       line.setY(clearPosition, NaN);

  //       // Increment the sweep position for the current line
  //       sweepPositions.current[i] = (currentSweepPos.current[i] + 1) % line.numPoints;
  //     });
  //   },
  //   [lines, wglPlots, gScaleY, goffset]
  // );


  const updatePlots = useCallback(
    (data: number[][]) => {
      // console.log(data);
      console.log(data);
      wglPlots.forEach((wglp, index) => {
        if (wglp) {
          try {
          } catch (error) {
            console.error(
              `Error setting gScaleY for WebglPlot instance at index ${index}:`,
              error
            );
          }
        } else {
          console.warn(`WebglPlot instance at index ${index} is undefined.`);
        }
      });
      // Loop through each sample index (assuming 1000 samples)
      for (let sampleIndex = 0; sampleIndex < 250; sampleIndex++) {
        linesRef.current.forEach((line, channelIndex) => {
            const channelData = data[channelIndex];
            const yMin = Math.min(...channelData);
            const yMax = Math.max(...channelData);
            const yRange = yMax - yMin || 1; // Avoid division by zero
            // Compute min and max for the current channel
            // const yMin = Math.min(...channelData);
            // const yMax = Math.max(...channelData);
            // const yRange = yMax - yMin || 1; // Avoid division by zero
    
            // Extract the EEG sample correctly for the current channel
            const sample = channelData[sampleIndex];
    
            // Normalize EEG value to range [-1, 1]
            // const yValue = ((sample - yMin) / yRange) * 2 - 1;
            const yValue =((sample - yMin) / yRange) * 2 - 1;

            // Update the sweep position for each channel
            currentSweepPos.current[channelIndex] = sweepPositions.current[channelIndex];
    
            // Plot the new data at the current sweep position
            line.setY(currentSweepPos.current[channelIndex] % line.numPoints, yValue);
    
            // Clear the next point to create a gap (optional, for visual effect)
            const clearPosition = Math.ceil(
                (currentSweepPos.current[channelIndex] + numXRef.current / 100) % line.numPoints
            );
            line.setY(clearPosition, NaN);
    
            // Increment the sweep position for the current channel
            sweepPositions.current[channelIndex] = (currentSweepPos.current[channelIndex] + 1) % line.numPoints;
        });
    }
    


      //   data.forEach((dataPoint) => {

      //   linesRef.current.forEach((line, i) => {
      //     // console.log(line);

      //     const yMin = Math.min(...data[i]);
      //   const yMax = Math.max(...data[i]);
      //   const yRange = yMax - yMin || 1; // Avoid division by zero
      //     let bitsPoints = Math.pow(2, 24);

      //     let yScale = 2 / bitsPoints;

      //     const yValue = Math.max(-1, Math.min(1, ((dataPoint[i] - yMin) / yRange) * 2 - 1));
      //     // console.log("yvalue",yValue);
      //     // Use a separate sweep position for each line
      //     currentSweepPos.current[i] = sweepPositions.current[i];
      //     // Plot the new data at the current sweep position
      //     line.setY(currentSweepPos.current[i] % line.numPoints, yValue);

      //     // Clear the next point to create a gap (optional, for visual effect)
      //     const clearPosition = Math.ceil((currentSweepPos.current[i] + (numXRef.current / 100)) % line.numPoints);
      //     line.setY(clearPosition, NaN);

      //     // Increment the sweep position for the current line
      //     sweepPositions.current[i] = (currentSweepPos.current[i] + 1) % line.numPoints;
      //   });
      // });
    },
    [lines, wglPlots, numChannels, theme]
  );


  useEffect(() => {
    createCanvases();
  }, [numChannels, theme]);
  //////
  const [sps, setSps] = useState('0x96');
  const channels = 8;
  const [connect, setConnect] = useState(false);
  const [connected, setConnected] = useState(false);
  const [channelConfigs, setChannelConfigs] = useState(
    Array.from({ length: 8 }, () => ({
      powerdown: false,
      srb2: false,
      pgaGain: "000",
      channelInput: "Normal",
    }))
  );

  useEffect(() => {
    setChannelConfigs((prevConfigs) => {
      const updatedConfigs = [...prevConfigs];
      if (channels > prevConfigs.length) {
        for (let i = prevConfigs.length; i < channels; i++) {
          updatedConfigs.push({
            powerdown: false,
            srb2: false,
            pgaGain: "000",
            channelInput: "Normal",
          });
        }
      } else if (channels < prevConfigs.length) {
        updatedConfigs.length = channels;
      }
      return updatedConfigs;
    });
  }, [channels]);

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

  useEffect(() => {
    if (!connect) return;

    const webSocket = new WebSocket("ws://oric.local:81");
    ws.current = webSocket;


    webSocket.onopen = () => {
      console.log("WebSocket connection established.");
      const commands = [
        { command: "reset", parameters: [] },
        { command: "sdatac", parameters: [] },
        { command: "wreg", parameters: [0x01, 0b10010011] },
        { command: "wreg", parameters: [0x02, 0xC0] },
        { command: "wreg", parameters: [0x03, 0xEC] },
        { command: "wreg", parameters: [0x15, 0b00100000] },
        { command: "wreg", parameters: [0x05, 0x60] },
        { command: "wreg", parameters: [0x06, 0x60] },
        { command: "wreg", parameters: [0x07, 0x60] },
        { command: "wreg", parameters: [0x08, 0x60] },
        { command: "wreg", parameters: [0x09, 0x60] },
        { command: "wreg", parameters: [0x0A, 0x60] },
        { command: "wreg", parameters: [0x0B, 0x60] },
        { command: "wreg", parameters: [0x0C, 0x60] },
        { command: "status", parameters: [] },
        { command: "rdatac", parameters: [] }
      ];
      commands.forEach((cmd) => webSocket.send(JSON.stringify(cmd)));
    };


    webSocket.onclose = () => {
      setConnected(false);
      setConnect(false);
      console.log("WebSocket connection closed.");
    };

    return () => {
      webSocket.close();
    };
  }, [connect, sps, channels, channelConfigs]);

  // WebSocket onmessage handling
  useEffect(() => {
    if (!ws.current) return;

    const webSocket = ws.current;

    webSocket.onmessage = (event) => {
      setConnected(true);
      const data = event.data;

      if (typeof data === "string") {
        console.warn("Unexpected string data received:", data);
        return;
      }

      if (data instanceof Blob) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const buffer = Buffer.from(reader.result as ArrayBuffer);
          const blockSize = 32;
          let newData: number[][] = Array(8).fill(null).map(() => []); // Initialize with 8 empty arrays
          for (let blockLocation = 0; blockLocation < buffer.length; blockLocation += blockSize) {
            const block = buffer.slice(blockLocation, blockLocation + blockSize);
            const channelData = [];
            for (let channel = 0; channel < 8; channel++) {
              const offset = 8 + channel * 3;
              const sample = block.readIntBE(offset, 3);
              channelData.push(sample);
              newData[channel].push(sample);

            }

            if (newData.length > 0) {
              // updatePlots(channelData);
              setData((prev) => {
                // Ensure prev is initialized properly
                if (!prev || prev.length !== 8) {
                  prev = Array(8).fill(null).map(() => []);
                }

                return prev.map((channelData, index) =>
                  [...channelData, ...newData[index]].slice(-250) // Maintain last 1000 samples
                );
              });
            }

          }
        };
        reader.readAsArrayBuffer(data);
      } else {
        console.error("Unexpected data format received:", data);
      }
    };
  }, [ws.current, gScaleY, goffset]);

  const animate = useCallback(() => {
    wglPlots.forEach((wglp) => wglp.update());
    requestAnimationFrame(animate);
  }, [wglPlots]);


  useEffect(() => {
    requestAnimationFrame(animate);
  }, [animate]);

  const zoomincrease = () => {
    const value = gScaleY + 1;
    // console.log(value);
    setGScaleY(value);
  };


  const zoomdecrease = () => {
    const value = gScaleY - 1;
    // console.log(value);
    setGScaleY(value);
  };


  const increase = () => {
    const value = goffset + 1;
    // console.log(value);
    setoffset(value);
  };


  const decrease = () => {
    const value = goffset - 1;
    // console.log(value);
    setoffset(value);
  };

  
  return (
    <div className="relative">


      {/* Canvas container */}
      <main className=" flex flex-col flex-[1_1_0%] h-[96vh] bg-highlight  rounded-2xl m-4 relative"
        ref={canvasContainerRef}
      >
      </main>
      {/* Settings Popup */}
      {isSettingsOpen && (
        <div className="fixed top-0 left-0 w-full h-full bg-black bg-opacity-50 flex justify-center items-center">
          <div className="bg-white rounded-lg p-6 ">
            <div
              className="flex flex-col flex-[1_1_0%] min-h-80 bg-[#000] p-6 rounded-2xl relative"
            >
              <div className="mb-4 flex ">
                <label
                  className="block text-xl font-semibold text-white mb-2"
                >
                  Choose Sampling Rate
                </label>
                <div className="relative">
                  <select
                    id="sps-selector"
                    value={sps}
                    onChange={(e) => setSps(e.target.value)}
                    className="block mx-4  px-4 py-2 text-black bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg focus:outline-none focus:ring-4 focus:ring-indigo-500 transition-all duration-300 ease-in-out"
                  >
                    <option value='0x96' className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">250 SPS</option>
                    <option value='0x95' className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">500 SPS</option>
                    <option value='0x94' className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">1000 SPS</option>
                    <option value='0x93' className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">2000 SPS</option>
                    <option value='0x92' className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">4000 SPS</option>
                    <option value='0x91' className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">8000 SPS</option>
                    <option value='0x90' className="py-2 px-4 text-lg hover:bg-purple-200 hover:text-indigo-600 transition-all">16000 SPS</option>
                  </select>
                </div>

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-8 overflow-hidden gap-2">
                {channelConfigs.slice(0, channels).map((config, i) => (
                  <div key={i} className="bg-white rounded-md p-4 shadow">
                    <h3 className="text-lg font-semibold text-gray-700 text-center">
                      Channel {i + 1} Configuration
                    </h3>
                    <div className="mb-3 flex items-center">
                      <label className="text-sm font-medium text-gray-700 mr-2">Channel Power Down</label>
                      <input
                        type="checkbox"
                        checked={config.powerdown}
                        onChange={(e) =>
                          handleChannelConfigChange(i, "powerdown", e.target.checked)
                        }
                        className="rounded border-gray-300 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="mb-3 flex items-center">
                      <label className="text-sm font-medium text-gray-700 mr-2">SRB2:</label>
                      <input
                        type="checkbox"
                        checked={config.srb2}
                        onChange={(e) =>
                          handleChannelConfigChange(i, "srb2", e.target.checked)
                        }
                        className="rounded border-gray-300 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700">PGA Gain:</label>
                      <select
                        value={config.pgaGain} // Convert `pgaGain` to a 3-bit binary string
                        onChange={(e) =>
                          handleChannelConfigChange(i, "pgaGain", e.target.value) // Parse binary to integer
                        }
                        className="mt-1 block w-full text-black rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        {[
                          { binary: "000", display: 1 },
                          { binary: "001", display: 2 },
                          { binary: "010", display: 4 },
                          { binary: "011", display: 6 },
                          { binary: "100", display: 8 },
                          { binary: "101", display: 12 },
                          { binary: "1121", display: 24 },
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
                        value={config.channelInput}
                        onChange={(e) =>
                          handleChannelConfigChange(i, "channelInput", e.target.value)
                        }
                        className="mt-1 block w-full text-black rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      >
                        <option value="000">Normal Electrode</option>
                        <option value="101">Test Signal</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setConnect(true) }
                }
                disabled={connected}
                className={`mt-4 w-[20vh] text-white align-center font-medium py-2 px-4 rounded-md ${connected ? "bg-green-400 cursor-not-allowed" : "bg-[#596275] hover:bg-indigo-700"
                  }`}
              >
                {connected ? "Connected" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
      <button
        className="absolute top-4 right-4 bg-blue-500 text-white px-4 py-2 rounded"
        onClick={toggleSettings}
      >
        <Settings />
      </button>
      <button
        className="absolute top-20 right-10 bg-blue-500 text-white px-4 py-2 rounded"
        onClick={zoomincrease}
      >
        +
      </button>
      <button
        className="absolute top-20 right-5 bg-blue-500 text-white px-4 py-2 rounded"
        onClick={zoomdecrease}
      >
        -
      </button>
      <p className="absolute top-20 right-20 bg-blue-500 text-white px-4 py-2 rounded"
      >Zoom: {gScaleY.toFixed(2)}</p>
      <button
        className="absolute top-30 right-10 bg-blue-500 text-white px-4 py-2 rounded"
        onClick={increase}
      >
        +
      </button>
      <button
        className="absolute top-30 right-5 bg-blue-500 text-white px-4 py-2 rounded"
        onClick={decrease}
      >
        -
      </button>
    
    </div>
  );
};

export default EEGMonitor;
