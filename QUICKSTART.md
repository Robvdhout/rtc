# Quick Start Guide

## Running the Application

### Option 1: Using NPM (Recommended)

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open in browser: `http://localhost:8080`

### Option 2: Using Python (No installation needed)

If you have Python installed, you can run:

```bash
# Python 3
python -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```

Then open: `http://localhost:8080`

### Option 3: Using any web server

You can use any static file server. Just make sure all files are served from the same directory.

## Testing Locally (Same Computer)

1. Start the server
2. Open two browser windows/tabs:
   - Window 1: `http://localhost:8080`
   - Window 2: `http://localhost:8080` (in a different window or tab)
3. Follow the connection steps

**Note**: You'll need to allow camera access in both windows. For QR scanning, you might need to use a phone to scan the QR code on your computer screen, or take a screenshot and show it to the camera.

## Testing on Two Devices

1. Start the server on one computer
2. Find your computer's IP address:
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` or `ip addr`
3. Open on first device: `http://localhost:8080`
4. Open on second device: `http://YOUR_IP:8080` (replace YOUR_IP with your actual IP)
5. Follow the connection steps

## Connection Steps

1. **Device 1**: Click "Generate QR Code (Start)"
2. **Device 2**: Click "Scan QR Code" and scan Device 1's QR code
3. **Device 1**: Click "Scan QR Code" and scan Device 2's QR code
4. **Connected!** Now you can control each other's backgrounds

## Troubleshooting

- **Camera not working**: Make sure to allow camera/microphone permissions
- **Can't scan QR code**: Try adjusting lighting or distance from screen
- **Connection fails**: Make sure both devices are on the same network
- **Works locally but not remotely**: Check firewall settings

## Tips

- Use good lighting when scanning QR codes
- Hold the camera steady when scanning
- If on the same device, use two different browser windows (not tabs) for better testing
- For best results, test on two physical devices

Enjoy! 🎉

