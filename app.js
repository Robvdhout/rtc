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
const resetBtn = document.getElementById('resetBtn');
async function init() {
    try {
        // Get local video stream
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: true
        });
        localVideo.srcObject = localStream;
        updateStatus('waiting', 'Ready to connect. Click "Generate QR Code" to start or "Scan QR Code" to join.');
    } catch (error) {
        console.error('Error accessing media devices:', error);
        updateStatus('waiting', 'Error: Could not access camera/microphone. Please grant permissions.');
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
        updateStatus('connecting', 'Creating offer...');
        roleDiv.textContent = '📱 You are Device 1 (Offerer)';

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
        await generateQRCode(offerData, offerQR);

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

// Generate QR code
async function generateQRCode(data, container) {
    container.innerHTML = '';
    try {
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, data, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });
        container.appendChild(canvas);
    } catch (error) {
        console.error('Error generating QR code:', error);
        container.innerHTML = '<p style="color: red;">Error generating QR code</p>';
    }
}

// Start scanning QR code
startScanBtn.addEventListener('click', async () => {
    try {
        scannerContainer.style.display = 'block';
        scanningActive = true;

        // Get camera stream for scanning
        scannerStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });
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
        const signalData = JSON.parse(data);

        if (signalData.type === 'offer') {
            // This device is Device 2 - create answer
            await handleOffer(signalData);
        } else if (signalData.type === 'answer') {
            // This device is Device 1 - handle answer
            await handleAnswer(signalData);
        }
    } catch (error) {
        console.error('Error handling scanned data:', error);
        alert('Invalid QR code data');
    }
}

// Handle offer (Device 2)
async function handleOffer(offer) {
    try {
        updateStatus('connecting', 'Processing offer...');
        roleDiv.textContent = '📱 You are Device 2 (Answerer)';

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
        await generateQRCode(answerData, offerQR);

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

