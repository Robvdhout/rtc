// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ]
};

// Global variables
let peerConnection = null;
let dataChannel = null;
let localStream = null;
let scannerStream = null;
let scanningActive = false;

// DOM elements
const createOfferBtn = document.getElementById('createOfferBtn');
const startScanBtn = document.getElementById('startScanBtn');
const stopScanBtn = document.getElementById('stopScanBtn');
const scannerVideo = document.getElementById('scannerVideo');
const scannerContainer = document.getElementById('scannerContainer');
const cameraSelect = document.getElementById('cameraSelect');
const offerQR = document.getElementById('offerQR');
const statusDiv = document.getElementById('status');
const roleDiv = document.getElementById('role');
const greenBtn = document.getElementById('greenBtn');
const redBtn = document.getElementById('redBtn');
const resetBtn = document.getElementById('resetBtn');
const pasteData = document.getElementById('pasteData');
const processDataBtn = document.getElementById('processDataBtn');

// Initialize
async function init() {
    updateStatus('waiting', '✅ Ready to connect. Click "Generate QR Code" to start or "Scan QR Code" to join.');
    await loadAvailableCameras();
}

// Load available cameras and populate dropdown
async function loadAvailableCameras() {
    try {
        // Request camera permission to enumerate devices
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Stop immediately after permission granted

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        cameraSelect.innerHTML = '';

        if (videoDevices.length === 0) {
            cameraSelect.innerHTML = '<option value="">No cameras found</option>';
            return;
        }

        // Add default option for mobile (tries rear camera first)
        if (isMobile()) {
            cameraSelect.innerHTML += '<option value="auto">Auto (Rear camera preferred)</option>';
        } else {
            cameraSelect.innerHTML += '<option value="auto">Default Camera</option>';
        }

        // Add each camera
        videoDevices.forEach((device, index) => {
            const label = device.label || `Camera ${index + 1}`;
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.textContent = label;
            cameraSelect.appendChild(option);
        });

        console.log(`✅ Found ${videoDevices.length} camera(s)`);
    } catch (error) {
        console.error('Error loading cameras:', error);
        cameraSelect.innerHTML = '<option value="auto">Default Camera</option>';
    }
}

// Update status display
function updateStatus(state, message) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${state}`;
}

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // No media streams needed - data channel only for background control

    // Handle ICE candidates - collect them for bootstrap
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('New ICE candidate:', event.candidate.candidate);
            // Store candidate for bootstrap (will be sent via data channel)
            pendingIceCandidates.push({
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
            });
        } else {
            console.log('ICE gathering complete -', pendingIceCandidates.length, 'candidates collected');
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('🔌 Connection state:', peerConnection.connectionState);
        switch (peerConnection.connectionState) {
            case 'connected':
                console.log('🎉 CONNECTION ESTABLISHED!');
                updateStatus('connected', '✅ Connected! You can now control each other\'s backgrounds.');
                enableControlButtons();
                break;
            case 'disconnected':
                console.log('⚠️ Connection disconnected');
                updateStatus('waiting', 'Disconnected. Refresh to reconnect.');
                disableControlButtons();
                break;
            case 'failed':
                console.log('❌ Connection failed');
                updateStatus('waiting', 'Connection failed. Refresh to try again.');
                disableControlButtons();
                break;
            case 'connecting':
                console.log('🔄 Connecting...');
                updateStatus('connecting', 'Connecting...');
                break;
        }
    };

    // Handle ICE connection state
    peerConnection.oniceconnectionstatechange = () => {
        console.log('ICE connection state:', peerConnection.iceConnectionState);
    };

    return peerConnection;
}

// Create data channel
function setupDataChannel(channel) {
    dataChannel = channel;

    dataChannel.onopen = () => {
        console.log('Data channel opened - bootstrapping ICE candidates');

        // Send pending ICE candidates through data channel
        if (pendingIceCandidates.length > 0) {
            console.log(`Sending ${pendingIceCandidates.length} ICE candidates via data channel`);
            const message = JSON.stringify({
                type: 'ice-candidates',
                candidates: pendingIceCandidates
            });
            dataChannel.send(message);
            pendingIceCandidates = [];
        }

        enableControlButtons();
    };

    dataChannel.onclose = () => {
        console.log('Data channel closed');
        disableControlButtons();
    };

    dataChannel.onmessage = (event) => {
        console.log('Received message:', event.data);
        handleRemoteMessage(event.data);
    };

    dataChannel.onerror = (error) => {
        console.error('Data channel error:', error);
    };
}

// Handle messages from remote peer
function handleRemoteMessage(message) {
    try {
        const data = JSON.parse(message);
        switch (data.type) {
            case 'ice-candidates':
                // Receive and add ICE candidates sent via data channel
                handleBootstrapICECandidates(data.candidates);
                break;
            case 'background':
                changeLocalBackground(data.color);
                break;
            default:
                console.log('Unknown message type:', data.type);
        }
    } catch (error) {
        console.error('Error handling message:', error);
    }
}

// Handle ICE candidates received via data channel bootstrap
async function handleBootstrapICECandidates(candidates) {
    if (iceCandidatesReceived) {
        console.log('ICE candidates already received, ignoring duplicates');
        return;
    }

    console.log(`Received ${candidates.length} ICE candidates via data channel`);
    iceCandidatesReceived = true;

    // Add each candidate to the peer connection
    for (const candidateData of candidates) {
        try {
            const candidate = new RTCIceCandidate({
                candidate: candidateData.candidate,
                sdpMid: candidateData.sdpMid,
                sdpMLineIndex: candidateData.sdpMLineIndex
            });

            await peerConnection.addIceCandidate(candidate);
            console.log('Added remote ICE candidate via bootstrap');
        } catch (error) {
            console.warn('Failed to add ICE candidate:', error);
        }
    }

    console.log('✅ ICE candidate bootstrap complete - connection should upgrade now');
    updateStatus('connecting', '✅ Exchanged ICE candidates - optimizing connection...');
}

// Change local background color
function changeLocalBackground(color) {
    document.body.classList.remove('bg-green', 'bg-red');
    if (color === 'green') {
        document.body.classList.add('bg-green');
    } else if (color === 'red') {
        document.body.classList.add('bg-red');
    }
}

// Send background change command
function sendBackgroundChange(color) {
    if (dataChannel && dataChannel.readyState === 'open') {
        const message = JSON.stringify({ type: 'background', color });
        dataChannel.send(message);
        console.log('Sent background change:', color);
    } else {
        console.error('Data channel not ready');
    }
}

// Create offer (Device 1)
createOfferBtn.addEventListener('click', async () => {
    try {
        updateStatus('connecting', 'Creating offer...');
        roleDiv.textContent = '📱 You are Device 1 (Offerer)';

        // No media streams needed - data channel only

        // Create peer connection
        if (peerConnection) {
            peerConnection.close();
        }
        createPeerConnection();

        // Create data channel
        const channel = peerConnection.createDataChannel('control');
        setupDataChannel(channel);

        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        // The SDP at this point doesn't contain ICE candidates yet
        // They'll be collected via onicecandidate event and sent later via data channel
        const offerData = JSON.stringify(peerConnection.localDescription);

        console.log(`SDP size (without ICE): ${offerData.length}`);
        console.log(`Bootstrap: ICE candidates will be collected and sent via data channel`);

        // Generate QR code
        generateQRCode(offerData, offerQR);

        updateStatus('connecting', 'Show this QR code to Device 2');
        createOfferBtn.disabled = true;
    } catch (error) {
        console.error('Error creating offer:', error);
        updateStatus('waiting', 'Error creating offer: ' + error.message);
    }
});

// Store ICE candidates to send later via data channel
let pendingIceCandidates = [];
let iceCandidatesReceived = false;

// Store received QR chunks for reassembly
let receivedChunks = {};
let expectedTotalChunks = null;

// Create minimal SDP by removing ICE candidates (reduces size by 80-90%)

// Compress data using base64 encoding
function compressData(str) {
    try {
        // Parse JSON and re-stringify without whitespace to reduce size
        let optimized = str;
        try {
            const parsed = JSON.parse(str);
            // Remove extra whitespace from SDP
            if (parsed.sdp) {
                // Remove unnecessary blank lines and trim
                parsed.sdp = parsed.sdp.split('\r\n')
                    .filter(line => line.trim().length > 0)
                    .join('\r\n');
            }
            optimized = JSON.stringify(parsed);
        } catch (e) {
            // If not JSON, use as-is
        }

        // Base64 encode
        const compressed = btoa(encodeURIComponent(optimized).replace(/%([0-9A-F]{2})/g,
            (match, p1) => String.fromCharCode('0x' + p1)));

        // If compression doesn't help much, return original
        if (compressed.length >= optimized.length * 0.95) {
            return optimized;
        }

        return 'C:' + compressed; // Prefix to indicate compressed
    } catch (error) {
        console.error('Compression failed:', error);
        return str;
    }
}

// Decompress data
function decompressData(str) {
    try {
        if (str.startsWith('C:')) {
            // Remove prefix and decompress
            const compressed = str.substring(2);
            return decodeURIComponent(atob(compressed).split('').map(c =>
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        }
        return str; // Not compressed
    } catch (error) {
        console.error('Decompression failed:', error);
        return str;
    }
}

// Sanitize SDP to remove problematic lines that cause parsing errors
function sanitizeSDP(description) {
    if (!description || !description.sdp) {
        return description;
    }

    // Remove ONLY lines that cause parsing errors in some browsers
    // Note: a=sctp-port is kept because it's essential for data channel structure
    const problematicLines = [
        'a=max-message-size:', // Causes issues on some browsers
        'a=extmap-allow-mixed' // Sometimes problematic
    ];

    const lines = description.sdp.split('\r\n');
    const sanitized = lines.filter(line => {
        return !problematicLines.some(problematic => line.startsWith(problematic));
    }).join('\r\n');

    const removedCount = lines.length - sanitized.split('\r\n').length;
    console.log(`SDP sanitized: removed ${removedCount} problematic line(s)`);

    return {
        type: description.type,
        sdp: sanitized
    };
}

// Generate QR code (with animated chunks for large data)
function generateQRCode(data, container) {
    container.innerHTML = '';

    // Try to compress the data first
    let processedData = compressData(data);
    console.log(`Original size: ${data.length}, Compressed size: ${processedData.length}`);

    // Check if qrcode library is available
    if (typeof qrcode === 'undefined') {
        console.error('QRCode library not loaded');
        showManualCopyUI(data, container, '⚠️ QR Code library failed to load');
        return;
    }

    // Check if data fits in single QR code
    const CHUNK_SIZE = 2000; // Safe size for single QR code

    if (processedData.length <= CHUNK_SIZE) {
        // Single QR code
        generateSingleQR(processedData, container);
    } else {
        // Multiple QR codes (animated)
        generateAnimatedQR(processedData, container);
    }
}

// Generate a single QR code
function generateSingleQR(data, container) {
    try {
        const qr = qrcode(0, 'L');
        qr.addData(data);
        qr.make();

        const qrImage = qr.createImgTag(3, 4);
        container.innerHTML = `
            <div style="text-align: center;">
                ${qrImage}
                <button id="copyQRDataBtn" 
                        style="margin-top: 15px; padding: 10px 20px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.9em;">
                    📋 Copy Data to Clipboard
                </button>
                <p style="color: #999; font-size: 0.85em; margin-top: 10px;">In case scanning doesn't work</p>
            </div>
        `;

        const img = container.querySelector('img');
        if (img) {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '0 auto';
        }

        // Add event listener for copy button
        const copyBtn = container.querySelector('#copyQRDataBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(data);
                    alert('✅ Copied to clipboard!');
                    console.log('✅ Data copied to clipboard');
                } catch (error) {
                    console.error('Failed to copy:', error);
                    alert('❌ Failed to copy. Please try manual copy/paste.');
                }
            });
        }

        console.log('✅ Single QR code generated');
    } catch (error) {
        console.error('Error generating QR code:', error);
        showManualCopyUI(data, container, `⚠️ Could not generate QR code: ${error.message}`);
    }
}

// Generate animated QR codes (multiple chunks)
function generateAnimatedQR(data, container) {
    const CHUNK_SIZE = 1800; // Smaller chunks for reliability

    // Split data into chunks
    const chunks = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
        chunks.push(data.substring(i, i + CHUNK_SIZE));
    }

    const totalChunks = chunks.length;
    console.log(`📊 Data split into ${totalChunks} chunks`);

    // Add chunk metadata to each chunk
    const chunksWithMetadata = chunks.map((chunk, index) => {
        return JSON.stringify({
            chunk: index + 1,
            total: totalChunks,
            data: chunk
        });
    });

    let currentChunk = 0;
    let animationInterval = null;

    // Create UI
    container.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <p style="color: #667eea; font-weight: bold; margin-bottom: 10px;">📱 Animated QR Codes</p>
            <p style="color: #666; font-size: 0.9em; margin-bottom: 15px;">
                Chunk <span id="currentChunk">1</span> of <span id="totalChunks">${totalChunks}</span>
            </p>
            <div id="qrChunkContainer" style="min-height: 300px; display: flex; align-items: center; justify-content: center; background: #f8f9fa; border-radius: 10px; padding: 20px;">
                <!-- QR codes will appear here -->
            </div>
            <div style="margin-top: 15px;">
                <button id="pauseBtn" style="padding: 10px 20px; background: #ffa502; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                    ⏸ Pause
                </button>
                <button id="prevChunkBtn" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">
                    ← Previous
                </button>
                <button id="nextChunkBtn" style="padding: 10px 20px; background: #6c757d; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Next →
                </button>
            </div>
            <p style="color: #999; font-size: 0.85em; margin-top: 15px;">
                💡 Scan each QR code in sequence on the other device
            </p>
            <button id="showManualBtn" style="margin-top: 10px; padding: 8px 16px; background: #e74c3c; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.9em;">
                Too difficult? Show manual copy option
            </button>
        </div>
    `;

    const qrChunkContainer = document.getElementById('qrChunkContainer');
    const currentChunkSpan = document.getElementById('currentChunk');
    const pauseBtn = document.getElementById('pauseBtn');
    const prevBtn = document.getElementById('prevChunkBtn');
    const nextBtn = document.getElementById('nextChunkBtn');
    const showManualBtn = document.getElementById('showManualBtn');

    let isPaused = false;

    // Function to display a specific chunk
    function displayChunk(index) {
        currentChunk = index;
        currentChunkSpan.textContent = index + 1;

        try {
            const qr = qrcode(0, 'L');
            qr.addData(chunksWithMetadata[index]);
            qr.make();

            qrChunkContainer.innerHTML = qr.createImgTag(4, 8);

            const img = qrChunkContainer.querySelector('img');
            if (img) {
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
            }
        } catch (error) {
            console.error('Error generating chunk QR:', error);
            qrChunkContainer.innerHTML = `<p style="color: red;">Error generating chunk ${index + 1}</p>`;
        }
    }

    // Start animation
    function startAnimation() {
        if (animationInterval) clearInterval(animationInterval);

        animationInterval = setInterval(() => {
            if (!isPaused) {
                currentChunk = (currentChunk + 1) % totalChunks;
                displayChunk(currentChunk);
            }
        }, 2000); // Change every 2 seconds
    }

    // Event listeners
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '▶ Resume' : '⏸ Pause';
        pauseBtn.style.background = isPaused ? '#2ecc71' : '#ffa502';
    });

    prevBtn.addEventListener('click', () => {
        currentChunk = (currentChunk - 1 + totalChunks) % totalChunks;
        displayChunk(currentChunk);
    });

    nextBtn.addEventListener('click', () => {
        currentChunk = (currentChunk + 1) % totalChunks;
        displayChunk(currentChunk);
    });

    showManualBtn.addEventListener('click', () => {
        if (animationInterval) clearInterval(animationInterval);
        showManualCopyUI(data, container, '⚠️ Switched to manual copy mode');
    });

    // Display first chunk and start animation
    displayChunk(0);
    startAnimation();

    console.log('✅ Animated QR sequence started');
}

// Show manual copy UI
function showManualCopyUI(data, container, message) {
    container.innerHTML = `
        <div style="padding: 20px; text-align: center;">
            <p style="color: orange; margin-bottom: 15px; font-weight: bold;">${message}</p>
            <p style="font-size: 0.9em; color: #666; margin-bottom: 10px;">Data is too large for QR code. Use manual copy/paste method:</p>
            <textarea readonly style="width: 100%; height: 150px; padding: 10px; font-family: monospace; font-size: 11px; border: 2px solid #ddd; border-radius: 5px; margin-bottom: 10px;">${data}</textarea>
            <button onclick="navigator.clipboard.writeText(this.previousElementSibling.value).then(() => alert('✅ Copied to clipboard! Paste on the other device.'))" 
                    style="padding: 12px 24px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 1em; font-weight: bold;">
                📋 Copy to Clipboard
            </button>
            <p style="font-size: 0.85em; color: #999; margin-top: 15px;">Then paste into the "Paste Data" field on the other device and click "Process Data"</p>
        </div>
    `;
}

// Detect if device is mobile
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
}

// Start scanning QR code
startScanBtn.addEventListener('click', async () => {
    try {
        scannerContainer.style.display = 'block';
        scanningActive = true;

        const selectedCamera = cameraSelect.value;

        // Get camera stream for scanning
        if (selectedCamera && selectedCamera !== 'auto') {
            // Use specific selected camera
            scannerStream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: selectedCamera } }
            });
            const selectedOption = cameraSelect.options[cameraSelect.selectedIndex];
            console.log(`✅ Selected camera opened: ${selectedOption.text}`);
        } else {
            // Auto mode: Mobile tries rear camera first, Desktop uses default
            if (isMobile()) {
                // Mobile device - prefer rear camera
                try {
                    scannerStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { exact: 'environment' } }
                    });
                    console.log('✅ Rear camera opened (auto mode)');
                } catch (error) {
                    console.log('Rear camera not available, using front camera');
                    scannerStream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: 'user' }
                    });
                }
            } else {
                // Desktop - just use default camera (webcam)
                scannerStream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
                console.log('✅ Webcam opened (auto mode)');
            }
        }

        scannerVideo.srcObject = scannerStream;

        // Wait for video to be ready and start playing
        try {
            await scannerVideo.play();
            console.log('✅ Video playing');
        } catch (error) {
            console.error('Error playing video:', error);
        }

        // Start scanning
        requestAnimationFrame(scanQRCode);
    } catch (error) {
        console.error('Error starting scanner:', error);
        alert('Error accessing camera for scanning: ' + error.message);
        scannerContainer.style.display = 'none';
    }
});

// Stop scanning
stopScanBtn.addEventListener('click', () => {
    stopScanning();
});

function stopScanning() {
    scanningActive = false;
    if (scannerStream) {
        scannerStream.getTracks().forEach(track => track.stop());
        scannerStream = null;
    }
    scannerVideo.srcObject = null;
    scannerContainer.style.display = 'none';
}

// Scan QR code
function scanQRCode() {
    if (!scanningActive) return;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (scannerVideo.readyState === scannerVideo.HAVE_ENOUGH_DATA) {
        canvas.height = scannerVideo.videoHeight;
        canvas.width = scannerVideo.videoWidth;
        context.drawImage(scannerVideo, 0, 0, canvas.width, canvas.height);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });

        if (code) {
            console.log('QR code detected');

            // Check if this is a chunked QR code
            try {
                const parsed = JSON.parse(code.data);
                if (parsed.chunk && parsed.total && parsed.data) {
                    // This is a chunk!
                    handleQRChunk(parsed);
                    return; // Don't stop scanning - need more chunks
                }
            } catch (e) {
                // Not a chunk, process as regular QR
            }

            // Regular QR code (single data)
            handleScannedData(code.data);
            stopScanning();
            return;
        }
    }

    requestAnimationFrame(scanQRCode);
}

// Handle QR chunk (part of animated sequence)
function handleQRChunk(chunkData) {
    const { chunk, total, data } = chunkData;

    // Initialize if first chunk
    if (expectedTotalChunks === null) {
        expectedTotalChunks = total;
        receivedChunks = {};
        console.log(`📊 Started receiving ${total} chunks`);
        updateStatus('connecting', `Receiving chunk 1 of ${total}... Keep scanning!`);
    }

    // Store chunk
    if (!receivedChunks[chunk]) {
        receivedChunks[chunk] = data;
        const received = Object.keys(receivedChunks).length;
        console.log(`✅ Received chunk ${chunk}/${total} (${received} total)`);
        updateStatus('connecting', `Received ${received} of ${total} chunks... Keep scanning!`);
    } else {
        console.log(`⚠️ Chunk ${chunk} already received, skipping`);
    }

    // Check if we have all chunks
    if (Object.keys(receivedChunks).length === expectedTotalChunks) {
        console.log('🎉 All chunks received! Reassembling...');
        reassembleAndProcess();
    }
}

// Reassemble chunks and process data
async function reassembleAndProcess() {
    stopScanning();

    // Reassemble in order
    let fullData = '';
    for (let i = 1; i <= expectedTotalChunks; i++) {
        if (receivedChunks[i]) {
            fullData += receivedChunks[i];
        } else {
            console.error(`Missing chunk ${i}!`);
            alert(`Error: Missing chunk ${i}. Please try scanning again.`);
            receivedChunks = {};
            expectedTotalChunks = null;
            return;
        }
    }

    console.log(`✅ Reassembled data: ${fullData.length} bytes`);
    updateStatus('connecting', 'Processing assembled data...');

    // Reset for next scan
    receivedChunks = {};
    expectedTotalChunks = null;

    // Process the complete data
    await handleScannedData(fullData);
}

// Handle scanned QR code data
async function handleScannedData(data) {
    try {
        console.log('📥 Processing data...', data.substring(0, 50) + '...');

        // Decompress if data was compressed
        const decompressed = decompressData(data);
        const signalData = JSON.parse(decompressed);

        console.log(`📋 Data type: ${signalData.type}`);

        if (signalData.type === 'offer') {
            // This device is Device 2 - create answer
            console.log('📨 Received offer, processing...');
            await handleOffer(signalData);
        } else if (signalData.type === 'answer') {
            // This device is Device 1 - handle answer
            console.log('📨 Received answer, processing...');
            await handleAnswer(signalData);
        } else {
            console.error('❌ Unknown data type:', signalData.type);
            alert('Invalid data type. Expected "offer" or "answer".');
        }
    } catch (error) {
        console.error('❌ Error handling data:', error);
        alert('Invalid data format. Please make sure you copied the complete data.');
    }
}

// Handle offer (Device 2)
async function handleOffer(offer) {
    try {
        updateStatus('connecting', 'Processing offer...');
        roleDiv.textContent = '📱 You are Device 2 (Answerer)';

        // No media streams needed - data channel only

        // Create peer connection
        if (peerConnection) {
            peerConnection.close();
        }
        createPeerConnection();

        // Set up data channel handler
        peerConnection.ondatachannel = (event) => {
            setupDataChannel(event.channel);
        };

        // Set remote description (with automatic sanitization fallback)
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            console.log('✅ SDP accepted without sanitization');
        } catch (error) {
            console.log('⚠️ SDP rejected, trying with sanitization...', error.message);
            const sanitizedOffer = sanitizeSDP(offer);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sanitizedOffer));
            console.log('✅ SDP accepted with sanitization');
        }

        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // The SDP at this point doesn't contain ICE candidates yet
        // They'll be collected via onicecandidate event and sent later via data channel
        const answerData = JSON.stringify(peerConnection.localDescription);

        console.log(`SDP size (without ICE): ${answerData.length}`);
        console.log(`Bootstrap: ICE candidates will be collected and sent via data channel`);

        // Generate QR code
        generateQRCode(answerData, offerQR);

        updateStatus('connecting', 'Show this QR code to Device 1');
    } catch (error) {
        console.error('Error handling offer:', error);
        updateStatus('waiting', 'Error processing offer: ' + error.message);
    }
}

// Handle answer (Device 1)
async function handleAnswer(answer) {
    try {
        updateStatus('connecting', 'Processing answer...');

        // Set remote description (with automatic sanitization fallback)
        try {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            console.log('✅ SDP accepted without sanitization');
        } catch (error) {
            console.log('⚠️ SDP rejected, trying with sanitization...', error.message);
            const sanitizedAnswer = sanitizeSDP(answer);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(sanitizedAnswer));
            console.log('✅ SDP accepted with sanitization');
        }

        updateStatus('connecting', 'Connection established! Waiting for peer...');
    } catch (error) {
        console.error('Error handling answer:', error);
        updateStatus('waiting', 'Error processing answer: ' + error.message);
    }
}

// Manual paste data handler
processDataBtn.addEventListener('click', async () => {
    const data = pasteData.value.trim();
    if (!data) {
        alert('Please paste connection data first');
        return;
    }

    try {
        await handleScannedData(data);
        pasteData.value = '';
    } catch (error) {
        console.error('Error processing pasted data:', error);
        alert('Invalid data format. Please make sure you copied the complete data.');
    }
});

// Control button handlers
greenBtn.addEventListener('click', () => {
    sendBackgroundChange('green');
});

redBtn.addEventListener('click', () => {
    sendBackgroundChange('red');
});

resetBtn.addEventListener('click', () => {
    sendBackgroundChange('default');
});

function enableControlButtons() {
    greenBtn.disabled = false;
    redBtn.disabled = false;
    resetBtn.disabled = false;
}

function disableControlButtons() {
    greenBtn.disabled = true;
    redBtn.disabled = true;
    resetBtn.disabled = true;
}

// Initialize on page load
init();
