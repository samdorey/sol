# Sol

![Header](Header.jpg)

<br/>
<div align="center">
  <a align="center" href="https://twitter.com/ospfranco">
    <img src="https://img.shields.io/twitter/follow/ospfranco?label=Follow%20%40ospfranco&style=social" />
  </a>
</div>

Sol is an open source app launcher, focused on ease of use and speed. It has minimal configuration and runs natively.

[Visit official site](https://sol.ospfranco.com)

## Download

Install via brew

```
brew install --cask sol
```

Or manually download the latest [release](https://github.com/ospfranco/sol/tree/main/releases).

## Discord

Join the Discord

https://discord.gg/W9XmqCQCKP

## Features

- App search
- Custom shortcuts
- Google translate
- Calendar
- Show upcoming appointement in Menu Bar
- Custom AppleScript commands
- Custom links
- Imports browser bookmarks
- Window Manager
- Emoji picker
- Clipboard manager
- Notes Scratchpad
- Retrieve Wi-Fi password
- Show IP address
- Start a google meet
- Switch OS theme
- Process killer
- Generate NanoID
- Generate UUID
- Generate lorem ipsum
- Format and paste JSON
- Forward media keys to Spotify/Apple Music
- Blacken Menu Bar
- Quickly evaluate math operations
- Script Runner
- Symbolic Link Support

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
