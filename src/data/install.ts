// This block is checked in CI against torana-edge/docs/QUICKSTART.md.
// Keep pages importing it rather than restating release-channel policy.
export const installCommand = `git clone https://github.com/torana-edge/torana-edge.git
cd torana-edge
go build -o ./torana ./cmd/torana
cp config.example.json config.json`;
