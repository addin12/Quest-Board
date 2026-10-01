// Pure: is a new password too easy to guess? Used at sign-up, password reset and change. Nothing leaves
// the server (no outside "breached passwords" service): a built-in list of the most common passwords —
// worldwide and Indonesian — plus the usual tricks: a common word with digits or symbols after it
// ("password123", "sayang2024!"), runs ("12345678", "abcdefgh", "qwertyui"), one repeated character,
// and the person's own name or email.

/** Common passwords and the words they're built from (lower case). Only what's 4+ characters matters. */
const COMMON = new Set(`
password passw0rd p@ssword p@ssw0rd pass1234 password1 letmein welcome welcome1 admin administrator login
qwerty qwertyuiop qwerty123 asdfgh asdfghjkl zxcvbn zxcvbnm 1q2w3e4r 1qaz2wsx qazwsx q1w2e3r4 iloveyou
abc123 abcd1234 aaaa1111 111111 1111 000000 0000 121212 123123 123321 654321 666666 696969 112233 777777
888888 999999 159753 147258 147258369 123qwe qwe123 baseball football soccer basketball monkey dragon
master shadow sunshine princess superman batman trustno1 starwars freedom whatever hello hello123 secret
charlie michael jordan jennifer computer internet samsung iphone google facebook instagram youtube
cookie chocolate butterfly flower summer winter autumn spring love lovely loveyou mylove forever
babygirl angel angels tigger pokemon naruto doraemon minecraft fortnite
bismillah alhamdulillah subhanallah assalamualaikum insyaallah sayang sayangku sayangkamu cintaku cinta
cintamu kasih kekasih rahasia katasandi sandi indonesia merdeka merahputih garuda pancasila jakarta
bandung surabaya semarang medan makassar bali jogja yogyakarta malang bekasi bogor depok tangerang
persib persija arema bonek manchester liverpool chelsea barcelona madrid juventus
kucing anjing ganteng cantik bidadari pangeran ayang mamah papah mama papa ibu bapak keluarga
doa sukses berkah barokah amanah semangat bahagia selamat
questboard dungeons dragons dungeon dnd tavern
`.split(/\s+/).filter(Boolean));

const KEYBOARD_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm", "abcdefghijklmnopqrstuvwxyz"];

/** A run along the keyboard or the alphabet, forwards or backwards ("12345678", "dcba", "qwertyui"). */
function isRun(s: string): boolean {
  if (s.length < 4) return false;
  return KEYBOARD_ROWS.some((row) => row.includes(s) || [...row].reverse().join("").includes(s));
}

/** "password123!" → "password": the word with digits and symbols trimmed off both ends. */
const core = (s: string) => s.replace(/^[^a-z]+|[^a-z]+$/g, "");

/**
 * Too easy to guess? `context`: the person's name and email (and anything else they'd use), which a
 * password shouldn't be built from either.
 */
export function isCommonPassword(password: string, context: string[] = []): boolean {
  const p = password.toLowerCase().trim();
  const squashed = p.replace(/[\s_.-]+/g, "");
  if (COMMON.has(p) || COMMON.has(squashed)) return true;
  if (/^(.)\1+$/.test(squashed)) return true; // "aaaaaaaa", "11111111"
  if (/^(.{1,4})\1+$/.test(squashed)) return true; // "abcabcabc", "12121212"
  if (isRun(squashed) || isRun(squashed.replace(/\d+$/, "")) && squashed.replace(/\d+$/, "").length >= 6) return true;
  // A common word with only digits or symbols around it: "password123", "Sayang2024!", "!!qwerty99".
  const c = core(squashed);
  if (c.length >= 4 && c.length >= squashed.length - 6 && (COMMON.has(c) || isRun(c))) return true;
  // Nothing but common words: "dungeons&dragons", "i love you", "sayang_cintaku".
  const words = p.split(/[^a-z]+/).filter((w) => w.length >= 3);
  if (words.length > 0 && words.every((w) => COMMON.has(w)) && words.join("").length >= squashed.replace(/[^a-z]/g, "").length - 2) return true;
  // Built from their own name or email: "budi1990", "budisantoso", "andi.pratama@…" → "andipratama".
  for (const item of context) {
    for (const part of item.toLowerCase().split(/[@\s._+-]+/).filter((x) => x.length >= 4)) {
      if (c === part || squashed === part || (c.includes(part) && c.length <= part.length + 4)) return true;
    }
    const whole = item.toLowerCase().split("@")[0].replace(/[^a-z0-9]/g, "");
    if (whole.length >= 4 && (squashed === whole || c === whole.replace(/\d+$/, ""))) return true;
  }
  return false;
}
