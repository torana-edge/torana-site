// Shared source-build instructions until tagged binaries are published.
export const installCommand = `git clone https://github.com/torana-edge/torana-edge.git
cd torana-edge
go build -o ./torana ./cmd/torana
cp config.example.json config.json`;
