# WebRTC QR Code Connection

A peer-to-peer WebRTC application that allows two devices to connect by scanning QR codes on each other's screens. Once connected, participants can control each other's background color by clicking colored buttons.

## Features

- 🎥 **WebRTC Video/Audio**: Real-time peer-to-peer video and audio streaming
- 📱 **QR Code Connection**: No signaling server required - connect by scanning QR codes
- 🎨 **Interactive Control**: Change remote participant's background color (Green/Red/Default)
- 🔒 **Direct P2P**: Secure peer-to-peer connection using WebRTC
- 📡 **Data Channel**: Real-time bidirectional communication for control messages

## How It Works

1. **Device 1** generates an offer and displays it as a QR code
2. **Device 2** scans Device 1's QR code, which contains the connection offer
3. **Device 2** generates an answer and displays it as a QR code
4. **Device 1** scans Device 2's QR code to complete the connection
5. Once connected, both devices can control each other's background color

## Setup Instructions

### Prerequisites

- Modern web browser with WebRTC support (Chrome, Firefox, Edge, Safari)
- Camera access for video streaming and QR code scanning
- Two devices (computers, tablets, or phones)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the local web server:
```bash
npm start
```

3. Open the application in your browser:
   - On the same device: `http://localhost:8080`
   - On another device on the same network: `http://YOUR_IP:8080`

### Usage

#### Step-by-Step Connection Process:

1. **On Device 1:**
   - Open the application in your browser
   - Allow camera and microphone access when prompted
   - Click the "Generate QR Code (Start)" button
   - A QR code will appear on the screen

2. **On Device 2:**
   - Open the application in your browser
   - Allow camera and microphone access when prompted
   - Click the "Scan QR Code" button
   - Point your camera at Device 1's screen to scan the QR code
   - After scanning, a new QR code will appear on Device 2's screen

3. **Back on Device 1:**
   - Click the "Scan QR Code" button
   - Point your camera at Device 2's screen to scan the QR code
   - The connection will be established!

4. **Control Each Other:**
   - Once connected, use the colored buttons to change the remote participant's background
   - Click "Green Background" to make the other device's background green
   - Click "Red Background" to make the other device's background red
   - Click "Reset Background" to restore the default gradient

## Technical Details

### Technologies Used

- **WebRTC**: For peer-to-peer video, audio, and data communication
- **RTCDataChannel**: For sending control messages between peers
- **QRCode.js**: For generating QR codes
- **jsQR**: For scanning and decoding QR codes
- **STUN servers**: Google's public STUN servers for NAT traversal

### Browser Compatibility

- ✅ Chrome/Chromium (recommended)
- ✅ Firefox
- ✅ Edge
- ✅ Safari (iOS 11+)
- ✅ Opera

### Security Notes

- All communication is peer-to-peer (no data passes through external servers)
- WebRTC connections are encrypted
- STUN servers are only used for NAT traversal (no media data sent through them)
- Camera/microphone access required

## Troubleshooting

### Connection Issues

- **Devices on different networks**: WebRTC may have trouble connecting through some firewalls/NAT configurations. Try connecting devices on the same WiFi network.
- **Camera permission denied**: Refresh the page and grant camera/microphone permissions
- **QR code not scanning**: Ensure good lighting and steady camera position

### Browser Issues

- **iOS Safari**: May need to use the rear camera for QR scanning
- **Incognito/Private mode**: May block camera access in some browsers

## Project Structure

```
RTC/
├── index.html      # Main HTML structure
├── style.css       # Styling and responsive design
├── app.js          # WebRTC logic, QR code handling, and data channel
├── package.json    # Project dependencies
└── README.md       # This file
```

## Future Enhancements

Possible improvements:
- Add more background color options
- Send text messages between peers
- Screen sharing capability
- File transfer functionality
- Connection history/favorites
- Custom color picker

## License

MIT License - Feel free to use and modify!

## Credits

Built with:
- [QRCode.js](https://github.com/soldair/node-qrcode)
- [jsQR](https://github.com/cozmo/jsQR)
- WebRTC API

---

**Note**: This is a demonstration project. For production use, consider implementing additional features like:
- Turn server for better connectivity in restricted networks
- Connection state recovery
- Error handling improvements
- Mobile optimization

