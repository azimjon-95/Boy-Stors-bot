require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const connectDB = require('./db/db');
const User = require('./models/User');

connectDB();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const userSteps = {}; // Telefon bosqichi uchun
const userStates = {}; // Har bir foydalanuvchi uchun state
const referralMap = {}; // /start?ref=id uchun

// /start komandasi
bot.onText(/\/start(?:\?ref=(\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const referrerId = match[1];

    const existingUser = await User.findOne({ telegramId: userId });

    if (existingUser) {
        return sendMainMenu(chatId);
    }

    if (referrerId) {
        referralMap[userId] = referrerId;
        await bot.sendMessage(referrerId, "🆕 Sizda yangi taklif mavjud!");
    }

    userSteps[chatId] = { step: 'waiting_for_phone' };

    const keyboard = {
        keyboard: [[{ text: "📞 Telefon raqamni yuborish", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
    };

    await bot.sendMessage(chatId, "📲 Telefon raqamingizni yuboring (faqat +998).", {
        reply_markup: keyboard
    });
});

bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.contact.user_id;

    if (userSteps[chatId]?.step !== 'waiting_for_phone') return;

    const phone = msg.contact.phone_number;
    if (!phone.startsWith('+998')) {
        return bot.sendMessage(chatId, "❌ Faqat +998 bilan boshlanuvchi O‘zbekiston raqamlari qabul qilinadi.");
    }

    const status = await checkChannelMembership(userId);
    if (!['member', 'creator', 'administrator'].includes(status)) {
        return bot.sendMessage(chatId, `❗️Avval ${REQUIRED_CHANNEL} kanaliga a’zo bo‘ling!`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: "🔗 Kanalga o'tish", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` },
                    { text: "✅ A'zo bo‘ldim", callback_data: "check_subscription" }
                ]]
            }
        });
    }

    const newUser = await User.create({
        telegramId: userId,
        phoneNumber: phone,
        username: msg.from.username || '',
        firstName: msg.from.first_name || '',
        referralBy: referralMap[userId] || null,
        starsEarned: 0
    });

    if (referralMap[userId]) {
        const refUser = await User.findOne({ telegramId: referralMap[userId] });
        if (refUser) {
            refUser.starsEarned = (refUser.starsEarned || 0) + 1;
            await refUser.save();
            await bot.sendMessage(refUser.telegramId, `✅ Sizga 1 ta ⭐ qo‘shildi! Jami: ${refUser.starsEarned} ⭐`);
        }
    }

    delete userSteps[chatId];
    delete referralMap[userId];
    await sendMainMenu(chatId);
});

bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;

    if (query.data === "check_subscription") {
        const status = await checkChannelMembership(userId);
        if (["member", "creator", "administrator"].includes(status)) {
            await bot.answerCallbackQuery(query.id, { text: "✅ Tasdiqlandi!" });
            return sendMainMenu(chatId);
        } else {
            await bot.answerCallbackQuery(query.id, { text: "❌ Siz hali a’zo emassiz." });
        }
    }

    if (query.data === "back_to_main" || query.data === "cancel_order") {
        delete userStates[chatId];
        return sendMainMenu(chatId);
    }
});

function sendMainMenu(chatId) {
    return bot.sendMessage(chatId, "✅ Endi xizmat turini tanlang:", {
        reply_markup: {
            keyboard: [
                ["⭐ Premium sotib olish", "💎 Stars sotib olish"],
                ["👥 Stars ishlash", "🚘 Support"]
            ],
            resize_keyboard: true
        }
    });
}

async function checkChannelMembership(userId) {
    try {
        const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
        return res.status;
    } catch (err) {
        console.error("Kanal tekshirishda xatolik:", err.message);
        return 'left';
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text?.trim();
    if (!text) return;

    if (text === "🔙 Ortga" || text === "❌ Bekor qilish") {
        delete userStates[chatId];
        return sendMainMenu(chatId);
    }

    if (userStates[chatId]?.step === 'waiting_for_star_recipient' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
        delete userStates[chatId];
        return sendMainMenu(chatId);
    }

    if (userStates[chatId]?.step === 'choosing_recipient' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
        delete userStates[chatId];
        return sendMainMenu(chatId);
    }

    if (userStates[chatId]?.step === 'waiting_for_star_amount' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
        delete userStates[chatId];
        return sendMainMenu(chatId);
    }

    if (userStates[chatId]?.step === 'choosing_package' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
        delete userStates[chatId];
        return sendMainMenu(chatId);
    }

    if (text === "👥 Stars ishlash") {
        return bot.sendMessage(chatId, `👥 Do‘stlaringizni taklif qilib yutib oling!

        Sizning referal havolangiz:
        https://t.me/${process.env.BOT_USERNAME}?start=ref${chatId}
        
        Har bir do‘st telefon raqamini yuborsa sizga 1 ⭐ beriladi. 50⭐ dan keyin almashtirish mumkin!`);
    }

    if (text === "💎 Stars sotib olish") {
        userStates[chatId] = { step: 'waiting_for_star_amount' };
        return bot.sendMessage(chatId, "Yozing nechta star kerak? (Minimal 50 ta, maksimal 5000 ta)");
    }

    if (userStates[chatId]?.step === 'waiting_for_star_amount') {
        const count = parseInt(text);
        if (isNaN(count) || count < 50 || count > 5000) {
            return bot.sendMessage(chatId, "❌ Stars miqdori 50-5000 oralig'ida bo'lishi kerak.");
        }

        const price = count * 240;
        userStates[chatId] = {
            step: 'waiting_for_star_recipient',
            starAmount: count,
            price
        };

        return bot.sendMessage(chatId, `⭐ ${count} ta star narxi: ${price} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
            reply_markup: {
                keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
                resize_keyboard: true
            }
        });
    }

    if (userStates[chatId]?.step === 'waiting_for_star_recipient') {
        let recipient = text.trim();
        if (recipient === "🙋‍♂️ O‘zimga") {
            recipient = `@${msg.from.username || "nomalum"}`;
        } else if (!recipient.startsWith('@')) {
            recipient = `@${recipient}`;
        }

        const { starAmount, price } = userStates[chatId];
        delete userStates[chatId];

        await bot.sendMessage(ADMIN_CHAT_ID, `💎 STARS BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n⭐ Miqdor: ${starAmount} ta\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

        return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\n⭐ ${starAmount} ta star\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
                        { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
                    ],
                    [
                        { text: "🔙 Ortga", callback_data: "back_to_main" },
                        { text: "❌ Bekor qilish", callback_data: "cancel_order" }
                    ]
                ]
            }
        });
    }

    if (text === "⭐ Premium sotib olish") {
        userStates[chatId] = { step: 'choosing_package' };

        return bot.sendMessage(chatId, `⚠️ <b>PREMIUM NARXLARI 🧙</b>\n\n🎁3 oylik - 175.000 so’m\n🎁6 oylik - 240.000 so’m\n🎁12 oylik - 405.000 so’m`, {
            parse_mode: "HTML",
            reply_markup: {
                keyboard: [
                    ["📦 3 oy", "📦 6 oy"],
                    ["📦 1 yil", "🔙 Ortga"]
                ],
                resize_keyboard: true
            }
        });
    }

    if (userStates[chatId]?.step === 'choosing_package' && text.startsWith("📦")) {
        const chosen = text.replace("📦 ", "").trim();
        const prices = {
            "3 oy": 170000,
            "6 oy": 240000,
            "1 yil": 405000
        };

        if (!prices[chosen]) return bot.sendMessage(chatId, "❌ Noto‘g‘ri paket.");

        userStates[chatId] = {
            step: 'choosing_recipient',
            selectedPackage: chosen,
            price: prices[chosen]
        };

        return bot.sendMessage(chatId, `Premium: ${chosen}\nNarxi: ${prices[chosen]} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
            reply_markup: {
                keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
                resize_keyboard: true
            }
        });
    }

    if (userStates[chatId]?.step === 'choosing_recipient') {
        let recipient = text.trim();
        if (recipient === "🙋‍♂️ O‘zimga") {
            recipient = `@${msg.from.username || "nomalum"}`;
        } else if (!recipient.startsWith('@')) {
            recipient = `@${recipient}`;
        }

        const { selectedPackage, price } = userStates[chatId];
        delete userStates[chatId];

        await bot.sendMessage(ADMIN_CHAT_ID, `🚕 PREMIUM BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n🎓 Paket: ${selectedPackage}\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

        return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\nPaket: ${selectedPackage}\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
                        { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
                    ],
                    [
                        { text: "🔙 Ortga", callback_data: "back_to_main" },
                        { text: "❌ Bekor qilish", callback_data: "cancel_order" }
                    ]
                ]
            }
        });
    }

    if (text === "🚘 Support") {
        return bot.sendMessage(chatId, `📞 Admin bilan bog‘lanish uchun quyidagi tugmani bosing:`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: "👨‍💻 Admin bilan bog‘lanish", url: `https://t.me/${process.env.SUPPORT_USERNAME}` }
                ]]
            }
        });
    }
});

