# Free hosting: Oracle Cloud "Always Free"

Oracle Cloud's Always Free tier includes an ARM server that is far bigger than Quest Board needs, at no
cost. This guide takes you from a new account to a running site. It's written for someone who hasn't
used Oracle Cloud before; allow about an hour.

Plans change — check [Oracle's Always Free page](https://www.oracle.com/cloud/free/) for the current
limits. At the time of writing they include, in total: **Ampere A1 (ARM) with 4 CPU cores and 24 GB
memory, 200 GB of disk, and 10 TB of traffic a month.** Quest Board runs comfortably on 1 core and 6 GB.

The image Quest Board's CI publishes works on ARM, and every change is rehearsed on ARM before it's
published (the `rehearsal` job in `.github/workflows/ci.yml`).

## Before you start

- **A card** for Oracle's identity check. Always Free resources aren't charged.
- **Choose the home region carefully: it can't be changed later**, and the free ARM servers only exist
  in the home region. Pick the one closest to your players — e.g. **Singapore** for Indonesia.
- Your domain, email provider and off-site backup settings from [README.md](README.md) and
  [EMAIL-DNS.md](EMAIL-DNS.md). Set up off-site backups (Cloudflare R2 is free up to 10 GB): if Oracle
  ever closes the account, "After losing the server" in the README brings everything back elsewhere.

## 1. Create the account, then upgrade it to Pay As You Go

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) and pick your home region.
2. **Recommended: Billing → Upgrade and manage payment → Pay As You Go.** You still pay nothing while you
   stay within the Always Free limits, but:
   - Oracle **reclaims idle Always Free servers on free accounts** (at the time of writing: over 7 days,
     CPU, network and memory use all under 20%). A quiet community site can look idle. Pay As You Go
     accounts aren't reclaimed.
   - Free ARM capacity is easier to get.
3. Right away, set a **budget alert**: Billing → Budgets → Create budget, e.g. US$1 a month, with an email
   alert. Then any charge reaches you before it grows.

## 2. Create the server

Menu → **Compute → Instances → Create instance**:

| Setting | Choose |
|---|---|
| Image | **Canonical Ubuntu 24.04** |
| Shape | **Ampere → VM.Standard.A1.Flex**, 1 OCPU and 6 GB memory (up to 4 and 24 stay free) |
| Networking | Create a new virtual cloud network with a **public subnet**, and **assign a public IPv4 address** |
| SSH keys | Paste your public key (`~/.ssh/id_ed25519.pub`; make one with `ssh-keygen -t ed25519`) |
| Boot volume | The default (about 50 GB) is plenty |

Check that the shape and image say **"Always Free-eligible"**. If creating fails with **"Out of
capacity"**, try another availability domain, try again later, or try a smaller shape.

Note the server's **public IP address**, and point your domain's **A record** at it.

## 3. Open ports 80 and 443 — in two places

This is the step everyone trips over: Oracle blocks web traffic **twice**, and the site won't load until
both are open.

**a. The network's security list** (Oracle's firewall in front of the server): Networking → Virtual
cloud networks → your network → Security → **Default security list** → **Add ingress rules**:

| Source CIDR | IP protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |
| `0.0.0.0/0` | UDP | `443` (HTTP/3; optional) |

**b. The server's own firewall.** Oracle's Ubuntu images come with `iptables` rules that reject
everything except SSH. Log in (`ssh ubuntu@<ip>`) and allow the web ports before the reject rule:

```sh
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save      # keep them after a reboot
```

On Oracle, **skip the `ufw` line** in the README's "Keeping the server safe": these `iptables` rules are
the server's firewall, and `ufw` would fight them. Do the SSH-key and automatic-updates steps.

## 4. Install Docker and start Quest Board

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && exit      # log in again so the group applies
```

Then follow the README's **First start**. With 6 GB of memory the server can build the image itself
(`docker compose up -d --build`), or use the ready-made one — see "Small servers" in the README.

## 5. Check it's still free

- Billing → Cost analysis should show 0.
- Everything you created should be marked **Always Free**. Don't add a load balancer, extra block
  volumes beyond the free total, or a paid shape.
