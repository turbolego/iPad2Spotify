# iPad2Spotify

A Spotify currently-playing dashboard designed for an iPad 2 running Safari/iOS 9.3.6. It shows album artwork, track information, playback state, and playback controls while Spotify plays on another device.

## Winamp Mode

The Winamp Mode feature recreates the classic Winamp 2.9 interface with four modular windows: main player, playlist editor, equalizer, and Milkdrop visualizer. The visual style, layout, and controls are inspired by [Webamp](https://github.com/captbaritone/webamp) by captbaritone — an open-source browser-based recreation of Winamp 2.x. Credit to captbaritone and the Webamp project for the reference design; this project's skin is a hand-built CSS/JS recreation (no Winamp/Webamp bitmap assets are copied, since those interface graphics remain the property of Nullsoft).

The Winamp skin uses:
- Thick beveled 3D window borders (outset/inset styling)
- Chunky metallic title bars with gradient shading
- Recessed LCD-style display area with inset borders
- 3D-raised transport buttons (Previous, Play, Pause, Stop, Next)
- 10-band equalizer with vertical sliders
- OldMilk visualizer for the Milkdrop window

Credit: Winamp is a trademark of Nullsoft/Winamp LLC. The Webamp project (https://webamp.org, https://github.com/captbaritone/webamp) is the reference for this implementation. Xubamp (https://github.com/hec-ovi/xubamp), licensed GPL-2.0-or-later, informed the clean-room component geometry and skin-like rendering hierarchy; no Xubamp Rust source or artwork is copied here.

