import type { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./password";
import { slugify } from "./policy";
import { COVER_ART, GM_PORTRAITS, coverPath, portraitPath } from "./placeholders";

// Demo data (Indonesia) so the marketplace is browsable on first run.
// Every account uses the password "password123".

type SeedGm = {
  name: string;
  email: string;
  hue: number;
  bio: string;
  headline: string;
  systems: string;
  years: number;
  location: string; // city, or "Online" for online-only GMs
  verified: boolean;
  payment: string;
};

const GMS: SeedGm[] = [
  {
    name: "Raka Pradipta", email: "gm@questboard.test", hue: 280, verified: true, years: 6, location: "Jakarta",
    headline: "Horor sinematik & intrik gotik",
    bio: "GM profesional selama enam tahun di Jakarta. Saya menjalankan horor slow-burn dengan banyak ruang untuk pemain, alat keamanan yang jelas, dan musik latar di setiap adegan.",
    systems: "Call of Cthulhu,Vampire: The Masquerade,Mothership",
    payment: "Transfer BCA 123-456-7890 a.n. Raka Pradipta, atau GoPay/DANA 0812-0000-1111. Bayar paling lambat H-1. Batal H-1 atau lebih awal: uang kembali penuh.",
  },
  {
    name: "Dewi Anggraini", email: "dewi@questboard.test", hue: 25, verified: true, years: 4, location: "Bandung",
    headline: "Fantasi heroik yang ramah pemula",
    bio: "Mantan guru, sekarang GM penuh waktu di Bandung. Meja saya terbuka untuk pemain yang baru pertama kali main — aturan saya ajarkan sambil jalan.",
    systems: "D&D 5.5e (2024),D&D 5e (2014),Daggerheart",
    payment: "QRIS / OVO 0813-2222-3333 (Dewi A.). Bukti transfer kirim di chat meja ya!",
  },
  {
    name: "Bima Saputra", email: "bima@questboard.test", hue: 190, verified: true, years: 8, location: "Online",
    headline: "Heist, kriminal & konsekuensi",
    bio: "Saya suka sistem di mana dadu yang menentukan cerita. Siap-siap tegang, banyak flashback, dan rencana yang gagal dengan indah.",
    systems: "Blades in the Dark,Shadowrun",
    payment: "Mandiri 987-654-3210 a.n. Bima Saputra. Transfer sebelum sesi dimulai.",
  },
  {
    name: "Nadia Kusuma", email: "nadia@questboard.test", hue: 140, verified: false, years: 10, location: "Yogyakarta",
    headline: "Pertarungan taktis & lore mendalam",
    bio: "Tactical combat, hand-drawn battle maps and a living world. I run long campaigns in English and Bahasa Indonesia, online and in person in Yogyakarta.",
    systems: "Pathfinder 2e,Starfinder,D&D 5e (2014)",
    payment: "BRI 1111-01-222222-50-3 a.n. Nadia Kusuma. Payment before the session, please.",
  },
];

type SeedGame = {
  gm: number;
  title: string;
  system: string;
  summary: string;
  description: string;
  format: "one_shot" | "campaign";
  location: "online" | "in_person";
  language: "id" | "en" | "both";
  platform?: string;
  city?: string;
  price: number; // Rupiah
  seats: number;
  level: "any" | "beginner" | "experienced";
  minAge?: number;
  cw?: string;
  safety?: string;
  tags: string;
  hue: number;
  sessions: number[]; // offsets in days from now (negative = past)
  hour: number; // UTC hour (12 UTC = 19.00 WIB)
};

const GAMES: SeedGame[] = [
  { gm: 0, title: "Mercusuar di Pulau Kabut", system: "Call of Cthulhu", summary: "Investigasi tahun 1920-an di pulau yang dilanda badai, tempat penjaga mercusuar menghilang.", description: "Penjaga mercusuar Pulau Kabut sudah sembilan hari tidak terlihat, tetapi lampunya tetap berputar setiap malam. Kalian adalah tim pengganti yang dikirim oleh Syahbandar.\n\nOne-shot ini adalah investigasi yang lambat dan penuh suasana — riset, wawancara, rasa takut yang terus naik, dan akhir yang akan kalian bicarakan berminggu-minggu. Karakter sudah disiapkan; tidak perlu pengalaman.", format: "one_shot", location: "online", language: "id", platform: "Discord + Foundry VTT", price: 75000, seats: 5, level: "any", cw: "Tenggelam, body horror, isolasi", safety: "Session zero, lines & veils, X-card", tags: "horor,investigasi,1920an,karakter-siap", hue: 210, sessions: [3, 10, -7], hour: 12 },
  { gm: 0, title: "Darah di Balik Tirai Beludru", system: "Vampire: The Masquerade", summary: "Intrik politik di antara elite vampir Jakarta. Kampanye mingguan untuk pemain dewasa.", description: "Sang Pangeran sekarat — lagi. Setiap coterie di Jakarta mencium peluang. Mainkan Kindred yang baru saja di-Embrace, menavigasi jaring utang budi, dendam, dan rasa lapar.\n\nSesi mingguan 3 jam. Pembuatan karakter dilakukan di sesi pertama, satu per satu bersama saya.", format: "campaign", location: "online", language: "id", platform: "Discord + Roll20", price: 100000, seats: 4, level: "experienced", minAge: 18, cw: "Darah, kekerasan, tema adiksi, manipulasi", safety: "Session zero, lines & veils, open door", tags: "intrik,urban,dewasa,roleplay", hue: 350, sessions: [5, 12, 19, 26], hour: 13 },
  { gm: 0, title: "Signal from Tartarus Station", system: "Mothership", summary: "Sci-fi survival horror in English. Your salvage crew answers a distress call. Bad idea.", description: "A mining station at the edge of the belt has been broadcasting the same eleven-second message for forty years. Your crew needs the money.\n\nMothership is quick to learn — characters take five minutes to build and about five seconds to die. A great first taste of sci-fi horror, played in English.", format: "one_shot", location: "online", language: "en", platform: "Discord + Owlbear Rodeo", price: 60000, seats: 5, level: "beginner", cw: "Gore, claustrophobia, body horror", safety: "Lines & veils, X-card", tags: "sci-fi,horror,survival,beginner-friendly", hue: 160, sessions: [6, 20], hour: 13 },
  { gm: 1, title: "Naga-naga Hutan Bara — Petualangan Pemula", system: "D&D 5.5e (2024)", summary: "Petualangan D&D pertamamu dengan aturan terbaru 2024. Aturan diajarkan sambil main, karakter disediakan.", description: "Belum pernah main? Meja ini untukmu. Kita buat karakter bersama di 20 menit pertama, belajar aturan saat dibutuhkan, lalu masuk ke Hutan Bara untuk mencari tahu kenapa naga-naga berhenti bernyanyi.\n\nTidak perlu buku, dadu, atau pengalaman — cukup rasa penasaran.", format: "one_shot", location: "online", language: "id", platform: "Discord + D&D Beyond (2024)", price: 50000, seats: 6, level: "beginner", minAge: 13, cw: "Kekerasan fantasi ringan", safety: "Session zero, X-card", tags: "fantasi,pemula,pemain-baru,remaja", hue: 25, sessions: [2, 4, 9, 16, -14], hour: 12 },
  { gm: 1, title: "Mahkota yang Terbelah", system: "D&D 5e (2014)", summary: "Kampanye heroik level 1 sampai 10 dengan aturan 5e 2014, dimainkan dwibahasa. Kerajaan, pencurian, dan seekor naga yang sarkastis.", description: "Mahkota Aldermere pecah menjadi tujuh keping, dan setiap keluarga bangsawan menginginkannya. Party kalian disewa untuk menemukan keping pertama.\n\nKampanye mingguan panjang yang memadukan pertarungan, eksplorasi, dan banyak roleplay. Dimainkan dalam Bahasa Indonesia dan English — pakai yang paling nyaman buatmu.", format: "campaign", location: "online", language: "both", platform: "Discord + Foundry VTT", price: 75000, seats: 5, level: "any", minAge: 16, cw: "Kekerasan fantasi, bahaya ringan", safety: "Session zero, lines & veils", tags: "fantasi,heroik,kampanye-panjang,roleplay", hue: 45, sessions: [7, 14, 21, 28, -7], hour: 12 },
  { gm: 1, title: "Panen Harapan", system: "Daggerheart", summary: "One-shot Daggerheart yang hangat tapi epik: selamatkan festival panen dari wabah misterius.", description: "Festival Panen tinggal tiga hari lagi dan kebun-kebun mulai berubah kelabu. Kelompok pahlawan tak terduga harus menemukan sumber wabah ini.\n\nDaggerheart bersifat kolaboratif, fokus pada cerita, dan mudah dipelajari. Main langsung di kafe board game di Bandung — cocok untuk datang bareng teman atau sendirian.", format: "one_shot", location: "in_person", language: "id", city: "Bandung", price: 40000, seats: 5, level: "beginner", cw: "Tidak ada yang diperkirakan", safety: "X-card, open door", tags: "cozy,fantasi,pemula,tatap-muka", hue: 90, sessions: [8, 22], hour: 7 },
  { gm: 2, title: "Doskvol Setelah Gelap", system: "Blades in the Dark", summary: "Bangun kru kriminal dan panjat tangga kekuasaan di kota industri yang berhantu.", description: "Doskvol adalah kota hantu, pagar petir, dan malam abadi. Kalian adalah kru pemula dengan ambisi besar dan utang yang lebih besar lagi.\n\nKampanye di mana fiksi menggerakkan segalanya — rencanakan sedikit, flashback lebih banyak. Aturan kita bahas di sesi pertama.", format: "campaign", location: "online", language: "id", platform: "Discord + Roll20", price: 90000, seats: 4, level: "any", cw: "Kekerasan, kriminalitas, hantu, penyiksaan (di luar layar)", safety: "Session zero, lines & veils, X-card", tags: "heist,dark-fantasy,kriminal,naratif", hue: 200, sessions: [4, 11, 18, -3], hour: 13 },
  { gm: 2, title: "Neon Run: Satu Malam di Neo-Surabaya", system: "Shadowrun", summary: "One-shot heist cyberpunk. Satu pekerjaan, satu malam, terlalu banyak megakorporasi.", description: "Mr. Johnson punya pekerjaan ekstraksi sederhana. Pekerjaan ekstraksi tidak pernah sederhana.\n\nKita main Shadowrun 6e dengan aturan yang dirampingkan dan runner siap pakai — hacker, street samurai, dan mage. Bahasa campur Indonesia/English.", format: "one_shot", location: "online", language: "both", platform: "Discord + Foundry VTT", price: 80000, seats: 5, level: "any", cw: "Kekerasan senjata api, distopia korporat", safety: "Lines & veils, X-card", tags: "cyberpunk,heist,karakter-siap", hue: 300, sessions: [5, 19], hour: 13 },
  { gm: 3, title: "Abomination Vaults", system: "Pathfinder 2e", summary: "Tactical dungeon crawl through a cursed megadungeon beneath a haunted lighthouse. Played in English.", description: "Something stirs beneath Gauntlight. A full adventure-path campaign with tactical battle maps, dynamic lighting and careful encounter design.\n\nBest for players who enjoy tactical combat and character building. PF2e knowledge helpful but not required.", format: "campaign", location: "online", language: "en", platform: "Foundry VTT + Discord", price: 85000, seats: 5, level: "experienced", minAge: 16, cw: "Undead, body horror, violence", safety: "Session zero, lines & veils", tags: "dungeon-crawl,tactical,long-campaign", hue: 130, sessions: [3, 10, 17, 24, -4], hour: 11 },
  { gm: 3, title: "Starfall Salvage", system: "Starfinder", summary: "One-shot fantasi luar angkasa gratis di Yogyakarta: berlomba dengan kru saingan menuju kapal alien.", description: "Sebuah kapal induk alien jatuh di bulan hutan dan setiap kru penjarah di sektor ini menginginkan bagiannya. Starfinder 2e dengan karakter siap pakai.\n\nCepat, penuh aksi, dan pengenalan yang bagus untuk sistemnya. Gratis — main di komunitas board game Yogyakarta.", format: "one_shot", location: "in_person", language: "both", city: "Yogyakarta", price: 0, seats: 6, level: "any", cw: "Kekerasan sci-fi", safety: "X-card", tags: "sci-fi,gratis,tatap-muka,karakter-siap", hue: 260, sessions: [9], hour: 7 },
];

/** Demo game slug → [genres CSV, styles CSV] (keys from lib/categories.ts). */
const SEED_CATEGORIES: Record<string, [string, string]> = {
  "mercusuar-di-pulau-kabut": [
    "horror,mystery",
    "roleplay-heavy,puzzle-mystery"
  ],
  "darah-di-balik-tirai-beludru": [
    "horror,urban",
    "roleplay-heavy,narrative"
  ],
  "signal-from-tartarus-station": [
    "sci-fi,horror",
    "theater-of-mind,puzzle-mystery"
  ],
  "naga-naga-hutan-bara-petualangan-pemula": [
    "fantasy",
    "rule-of-cool,theater-of-mind"
  ],
  "mahkota-yang-terbelah": [
    "fantasy",
    "roleplay-heavy,sandbox"
  ],
  "panen-harapan": [
    "fantasy,cozy",
    "roleplay-heavy,narrative"
  ],
  "doskvol-setelah-gelap": [
    "dark-fantasy,urban",
    "sandbox,narrative"
  ],
  "neon-run-satu-malam-di-neo-surabaya": [
    "cyberpunk,sci-fi",
    "combat-heavy,rule-of-cool"
  ],
  "abomination-vaults": [
    "fantasy,horror",
    "tactical,dungeon-crawl"
  ],
  "starfall-salvage": [
    "sci-fi",
    "combat-heavy,rule-of-cool"
  ]
};

const PLAYERS = [
  { name: "Andi Wijaya", email: "player@questboard.test", hue: 200 },
  { name: "Putri Maharani", email: "putri@questboard.test", hue: 320 },
  { name: "Fajar Nugroho", email: "fajar@questboard.test", hue: 100 },
  { name: "Intan Permata", email: "intan@questboard.test", hue: 20 },
  { name: "Yoga Prasetyo", email: "yoga@questboard.test", hue: 170 },
  { name: "Citra Ayu", email: "citra@questboard.test", hue: 50 },
];

const REVIEW_LINES = [
  { rating: 5, body: "Sesi yang luar biasa! Suasananya pas banget dan semua pemain dapat momen untuk bersinar." },
  { rating: 5, body: "Best GM I've played with. Great pacing, great voices, great safety tools." },
  { rating: 4, body: "Seru banget — awalnya agak pelan, tapi satu jam terakhir keren parah." },
  { rating: 5, body: "Pertama kali main dan langsung merasa diterima. Sudah booking sesi berikutnya!" },
  { rating: 4, body: "Tactical, fair and well prepared. Would play again." },
];

export function seedDatabase(conn: DatabaseSync) {
  const pw = hashPassword("password123");
  const now = Date.now();
  const day = 86_400_000;

  conn.exec("BEGIN");
  try {
    const insUser = conn.prepare(
      "INSERT INTO users (email, password_hash, name, role, avatar_hue, bio, avatar_image) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const insGm = conn.prepare(
      "INSERT INTO gm_profiles (user_id, headline, systems, years_experience, location, verified, payment_info) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    const gmIds = GMS.map((g) => {
      const portrait = GM_PORTRAITS[g.email];
      const id = Number(insUser.run(g.email, pw, g.name, "gm", g.hue, g.bio, portrait ? portraitPath(portrait.key) : "").lastInsertRowid);
      insGm.run(id, g.headline, g.systems, g.years, g.location, g.verified ? 1 : 0, g.payment);
      return id;
    });
    const playerIds = PLAYERS.map((p) =>
      Number(insUser.run(p.email, pw, p.name, "player", p.hue, "", "").lastInsertRowid),
    );
    insUser.run("admin@questboard.test", pw, "Admin Quest Board", "admin", 0, "", "");

    const insGame = conn.prepare(`INSERT INTO games
      (gm_id, slug, title, system, summary, description, format, location_type, language, platform, city,
       price_idr, seats_total, experience_level, min_age, content_warnings, safety_tools, tags, cover_hue, cover_image, genres, styles)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insSession = conn.prepare(
      "INSERT INTO game_sessions (game_id, starts_at, duration_minutes, status) VALUES (?, ?, ?, ?)",
    );
    const insBooking = conn.prepare(
      "INSERT INTO bookings (session_id, player_id, status, price_idr) VALUES (?, ?, 'confirmed', ?)",
    );
    const insReview = conn.prepare("INSERT INTO reviews (game_id, player_id, rating, body) VALUES (?, ?, ?, ?)");
    const insMsg = conn.prepare("INSERT INTO messages (game_id, user_id, body) VALUES (?, ?, ?)");

    let reviewCursor = 0;
    GAMES.forEach((g, gi) => {
      const gameId = Number(
        insGame.run(
          gmIds[g.gm], slugify(g.title), g.title, g.system, g.summary, g.description, g.format, g.location, g.language,
          g.platform ?? "", g.city ?? "", g.price, g.seats, g.level, g.minAge ?? 18,
          g.cw ?? "", g.safety ?? "", g.tags, g.hue, COVER_ART[slugify(g.title)] ? coverPath(slugify(g.title)) : "",
          ...(SEED_CATEGORIES[slugify(g.title)] ?? ["", ""]),
        ).lastInsertRowid,
      );

      g.sessions.forEach((offset, si) => {
        const start = new Date(now + offset * day);
        start.setUTCHours(g.hour, 0, 0, 0);
        const status = offset < 0 ? "completed" : "scheduled";
        const sessionId = Number(insSession.run(gameId, start.toISOString(), 180, status).lastInsertRowid);
        // Deterministic spread of bookings: some sessions nearly full, some empty.
        const count = Math.min(g.seats, (gi + si * 2) % (g.seats + 1));
        for (let p = 0; p < count && p < playerIds.length; p++) {
          const pid = playerIds[(gi + p) % playerIds.length];
          insBooking.run(sessionId, pid, g.price);
          // The demo player keeps past games unreviewed so the review flow can be tried.
          if (status === "completed" && pid !== playerIds[0]) {
            const r = REVIEW_LINES[reviewCursor++ % REVIEW_LINES.length];
            try {
              insReview.run(gameId, pid, r.rating, r.body);
            } catch {
              /* one review per player per game */
            }
          }
        }
      });

      insMsg.run(
        gameId,
        gmIds[g.gm],
        g.language === "en"
          ? "Welcome, adventurers! Post any questions about the game here. See you at the table."
          : "Selamat datang, para petualang! Silakan tanya apa saja tentang game ini di sini. Sampai jumpa di meja!",
      );
    });

    conn.exec("UPDATE users SET email_verified_at = created_at"); // demo accounts are verified
    conn.exec("COMMIT");
  } catch (err) {
    conn.exec("ROLLBACK");
    throw err;
  }
}
