# VPS Kaise Lo — Step by Step (Hinglish)

## Recommended: Hostinger KVM 2 — ₹799/mahina

1. Kholo: https://www.hostinger.com/in/vps-hosting
2. **KVM 2** plan chuno (2 CPU, 8 GB RAM, 100 GB NVMe)
3. Period: 24 mahine (sabse sasta) — 1 saal free domain bhi milta hai
4. Payment: UPI / card
5. Setup ke waqt:
   - **Data center: India** chuno (tumhare users ke liye fast)
   - **Operating system: Ubuntu 24.04 LTS** (plain, koi panel nahi)
   - Root password strong rakho aur save kar lo
6. Hostinger tumhe dega: **IP address** + **root password** — ye dono save karo

## Alternatives (agar Hostinger na chahiye)

| Provider | Plan | Price | Note |
|----------|------|-------|------|
| Hostinger | KVM 1 (4 GB) | ₹599/mo | thoda kam RAM, chalega |
| Contabo | VPS M | ~₹600/mo | sasta, par India DC nahi |
| Hetzner | CX22 | ~€4/mo | Europe DC, thoda slow India se |

## Domain (agar nahi hai)

Hostinger ke saath 1 saal free domain milta hai, ya ~₹500-800/saal me koi bhi
domain lo. Backend ke liye bas ek subdomain chahiye: `api.yourdomain.com`.

## VPS milne ke baad

1. DNS me A record banao: `api.yourdomain.com` → VPS ka IP
2. Mujhe (Lovable chat me) batao — main baaki setup guide kar dunga,
   ya SSH details do to main khud setup kar dunga.

**Note:** Root password kabhi bhi public chat me paste mat karo —
main secure tarika bata dunga jab time aaye.
