# Frequently Asked Questions (FAQ)

## General Questions

### Is CraftCommand free?

Yes. CraftCommand is open-source and released under the AGPLv3 license. You can use it for personal and commercial servers for free.

### Does it support Modpacks?

Absolutely. The system includes a **Heuristic Installer** that can automatically detect, unzip, and configure modpacks from CurseForge, Modrinth, and custom ZIP files.

### Can I run it on Linux?

Yes. While `run_locally.bat` is provided for Windows users, you can use `npm run start:all` on Linux or macOS provided you have Node.js and Java installed.

## Technical Questions

### Where are my servers stored?

By default, all Minecraft instances are stored in the `minecraft_servers/` directory in the project root.

### How do I reset my Admin password?

If you lose access, you can manually edit `backend/data/users.json` and replace the hashed password with a known bcrypt hash, or use the emergency restore script if available in `scripts/`.

### Can I run multiple nodes?

Yes! Version 1.10.x introduced **Distributed Operations**. You can add additional "Worker Nodes" in Global Settings and manage them all from a single dashboard.

## Networking

### Do I NEED a domain?

No. You can always join via your public or local IP. However, using a Domain makes it easier for friends to remember and join.

### Is it safe to open ports?

Any time you open a port, there is a risk. I recommend using a mesh VPN like **Tailscale** for private groups or a hardened **Reverse Proxy** for public access. Always keep "The Doctor" diagnostics active to monitor for unusual behavior.
