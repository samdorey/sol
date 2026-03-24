# Sol

Sol is an open source app launcher, focused on ease of use and speed. It has minimal configuration and runs natively. 

This is a fork by samdorey, that uses sol as a base but adds/removes some features. [Official site for sol](https://sol.ospfranco.com)

Fork features:
- Disabled translation
- Removed Mise as a toolchain manager
- Added firefox tab and history search

## Development

### Prerequisites

- **Xcode** (from the App Store — accept the license with `sudo xcodebuild -license accept` and run `sudo xcodebuild -runFirstLaunch`)
- **Bun** (`brew install oven-sh/bun/bun`)
- **CocoaPods** (`brew install cocoapods`)
- **Node.js** (`brew install node`) — needed for the Firefox bridge

### Setup

```sh
# Install JS dependencies
bun install

# Install native dependencies
cd macos && pod install && cd ..

# Run the app in debug mode
bun run macos
```

### Firefox Integration

To enable Firefox tab and history search, see [FIREFOX_SETUP.md](FIREFOX_SETUP.md).

## License

MIT License
