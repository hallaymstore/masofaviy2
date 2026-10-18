package uz.hallaym.edu

/**
 * Commands the phone itself handles (everything else goes to the web assistant, which understands the platform).
 * Same tolerance as the web side: Latin/Cyrillic, apostrophes, «ochvor», «ochchi», «chiqvor», j/y and o/a slips.
 */
object AppCommands {
    enum class Kind { OPEN_APP, EXIT_APP, SLEEP, NONE }

    private val cyr = mapOf('а' to "a", 'б' to "b", 'в' to "v", 'г' to "g", 'д' to "d", 'е' to "e", 'ё' to "yo", 'ж' to "j", 'з' to "z", 'и' to "i",
        'й' to "y", 'к' to "k", 'л' to "l", 'м' to "m", 'н' to "n", 'о' to "o", 'п' to "p", 'р' to "r", 'с' to "s", 'т' to "t", 'у' to "u", 'ф' to "f",
        'х' to "x", 'ц' to "ts", 'ч' to "ch", 'ш' to "sh", 'щ' to "sh", 'ъ' to "", 'ы' to "i", 'ь' to "", 'э' to "e", 'ю' to "yu", 'я' to "ya",
        'ў' to "o", 'қ' to "q", 'ғ' to "g", 'ҳ' to "h")

    fun normalize(text: String): String {
        val sb = StringBuilder()
        for (ch in text.lowercase()) sb.append(cyr[ch] ?: ch.toString())
        return sb.toString().replace(Regex("[‘’'`ʻʼ]"), "").replace(Regex("[^a-z0-9\\s]"), " ").replace(Regex("\\s+"), " ").trim()
    }

    /** Removes the wake word from the start: «Madina, kutubxonani och» → «kutubxonani och». */
    fun stripWake(text: String, wakeWords: List<String>): String {
        var t = text.trim()
        for (w in wakeWords) {
            val rx = Regex("^(hey\\s+)?" + Regex.escape(w) + "[,!.\\s]*", RegexOption.IGNORE_CASE)
            t = t.replace(rx, "")
        }
        return t.trim()
    }

    fun classify(raw: String): Kind {
        val t = normalize(raw)
        if (t.isEmpty()) return Kind.NONE
        val app = Regex("\\b(ilova|ilovani|ilovaga|ilovadan|ilava|ilavani|prilojenie|platforma|platformaga|saytga|saytni)\\b").containsMatchIn(t)
        val open = Regex("\\b(och|ochvor|ochchi|ochgin|oching|kir|kirvor|kirchi|kiring|yoq|yoqvor|otkroy|zapusti)\\w*").containsMatchIn(t)
        val exit = Regex("\\b(chiq|chiqvor|chiqchi|chiqing|yop|yopvor|yopchi|yoping|zakroy|vyydi)\\w*").containsMatchIn(t)
        if (app && exit) return Kind.EXIT_APP
        if (app && open) return Kind.OPEN_APP
        if (Regex("\\b(uxla|dam ol|tinglama|tinglashni toxtat|mikrofonni ochir|jim bol)\\b").containsMatchIn(t)) return Kind.SLEEP
        return Kind.NONE
    }
}
