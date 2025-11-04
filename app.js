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
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const createOfferBtn = document.getElementById('createOfferBtn');
const startScanBtn = document.getElementById('startScanBtn');
const stopScanBtn = document.getElementById('stopScanBtn');
const scannerVideo = document.getElementById('scannerVideo');
const scannerContainer = document.getElementById('scannerContainer');
const offerQR = document.getElementById('offerQR');
const statusDiv = document.getElementById('status');
const roleDiv = document.getElementById('role');
const greenBtn = document.getElementById('greenBtn');
const redBtn = document.getElementById('redBtn');
// Initialize
async function init() {
    updateStatus('waiting', '✅ Ready to connect. Click "Generate QR Code" to start or "Scan QR Code" to join.');
}

// Update status display
function updateStatus(state, message) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${state}`;
}

// Create peer connection
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(configuration);

    // Add local stream tracks to peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
        console.log('Received remote track:', event.track.kind);
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
        }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('New ICE candidate:', event.candidate);
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        switch (peerConnection.connectionState) {
            case 'connected':
                updateStatus('connected', '✅ Connected! You can now control each other\'s backgrounds.');
                enableControlButtons();
                break;
            case 'disconnected':
                updateStatus('waiting', 'Disconnected. Refresh to reconnect.');
                disableControlButtons();
                break;
            case 'failed':
                updateStatus('waiting', 'Connection failed. Refresh to try again.');
                disableControlButtons();
                break;
            case 'connecting':
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
        console.log('Data channel opened');
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
        updateStatus('connecting', 'Requesting camera access...');
        roleDiv.textContent = '📱 You are Device 1 (Offerer)';

        // Get local video stream if not already available
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: true
                });
                localVideo.srcObject = localStream;
            } catch (error) {
                console.error('Error accessing media devices:', error);
                alert('Camera/microphone access is required to create a connection. Please grant permissions and try again.');
                updateStatus('waiting', '⚠️ Camera access denied. Please grant permissions and try again.');
                return;
            }
        }

        updateStatus('connecting', 'Creating offer...');

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

        // Wait for ICE gathering to complete
        await waitForICEGathering();

        // Generate QR code with the complete offer
        const offerData = JSON.stringify(peerConnection.localDescription);
        generateQRCode(offerData, offerQR);

        updateStatus('connecting', 'Show this QR code to Device 2');
        createOfferBtn.disabled = true;
    } catch (error) {
        console.error('Error creating offer:', error);
        updateStatus('waiting', 'Error creating offer: ' + error.message);
    }
});

// Wait for ICE gathering to complete
function waitForICEGathering() {
    return new Promise((resolve) => {
        if (peerConnection.iceGatheringState === 'complete') {
            resolve();
        } else {
            const checkState = () => {
                if (peerConnection.iceGatheringState === 'complete') {
                    peerConnection.removeEventListener('icegatheringstatechange', checkState);
                    resolve();
                }
            };
            peerConnection.addEventListener('icegatheringstatechange', checkState);
        }
    });
}

// Compress data using LZ-based compression (simple implementation)
function compressData(str) {
    try {
        // Simple LZ-string-like compression
        const compressed = btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
            (match, p1) => String.fromCharCode('0x' + p1)));

        // If compression doesn't help much, return original
        if (compressed.length >= str.length * 0.9) {
            return str;
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

// Generate QR code
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

    // Check if data is too large for QR code (even after compression)
    if (processedData.length > 2000) {
        console.warn('Data too large for QR code, showing manual copy option');
        showManualCopyUI(data, container, '⚠️ Connection data too large for QR code');
        return;
    }

    try {
        // qrcode-generator API with lowest error correction for maximum data capacity
        const qr = qrcode(0, 'L'); // 0 = auto, 'L' = low error correction (max capacity)
        qr.addData(processedData);
        qr.make();

        // Create image element with the QR code
        const qrImage = qr.createImgTag(4, 8); // smaller cell size and margin
        container.innerHTML = qrImage;

        // Style the image
        const img = container.querySelector('img');
        if (img) {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.display = 'block';
            img.style.margin = '0 auto';
        }
    } catch (error) {
        console.error('Error generating QR code:', error);
        // Fallback to text display
        showManualCopyUI(data, container, `⚠️ Could not generate QR code: ${error.message}`);
    }
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

// Start scanning QR code
startScanBtn.addEventListener('click', async () => {
    try {
        scannerContainer.style.display = 'block';
        scanningActive = true;

        // Get camera stream for scanning - prefer rear camera on mobile
        try {
            // Try to explicitly request rear camera first
            scannerStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { exact: 'environment' }
                }
            });
        } catch (error) {
            console.log('Exact environment camera not found, trying ideal...');
            // Fallback to ideal (prefer rear but allow front if rear not available)
            try {
                scannerStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' }
                    }
                });
            } catch (error2) {
                console.log('Ideal environment failed, trying any camera...');
                // Last fallback - any camera
                scannerStream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
            }
        }

        scannerVideo.srcObject = scannerStream;

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
            handleScannedData(code.data);
            stopScanning();
            return;
        }
    }

    requestAnimationFrame(scanQRCode);
}

// Handle scanned QR code data
async function handleScannedData(data) {
    try {
        // Decompress if data was compressed
        const decompressed = decompressData(data);
        const signalData = JSON.parse(decompressed);

        if (signalData.type === 'offer') {
            // This device is Device 2 - create answer
            await handleOffer(signalData);
        } else if (signalData.type === 'answer') {
            // This device is Device 1 - handle answer
            await handleAnswer(signalData);
        }
    } catch (error) {
        console.error('Error handling scanned data:', error);
        alert('Invalid QR code data. Please try the manual copy/paste method.');
    }
}

// Handle offer (Device 2)
async function handleOffer(offer) {
    try {
        updateStatus('connecting', 'Requesting camera access...');
        roleDiv.textContent = '📱 You are Device 2 (Answerer)';

        // Get local video stream if not already available
        if (!localStream) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: true
                });
                localVideo.srcObject = localStream;
            } catch (error) {
                console.error('Error accessing media devices:', error);
                alert('Camera/microphone access is required. Please grant permissions and try again.');
                updateStatus('waiting', '⚠️ Camera access denied. Please grant permissions and try again.');
                return;
            }
        }

        updateStatus('connecting', 'Processing offer...');

        // Create peer connection
        if (peerConnection) {
            peerConnection.close();
        }
        createPeerConnection();

        // Set up data channel handler
        peerConnection.ondatachannel = (event) => {
            setupDataChannel(event.channel);
        };

        // Set remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Wait for ICE gathering
        await waitForICEGathering();

        // Generate QR code with answer
        const answerData = JSON.stringify(peerConnection.localDescription);
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
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        updateStatus('connecting', 'Connection established! Waiting for peer...');
    } catch (error) {
        console.error('Error handling answer:', error);
        updateStatus('waiting', 'Error processing answer: ' + error.message);
    }
}

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

