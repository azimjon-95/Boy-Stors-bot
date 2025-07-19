require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const connectDB = require("./db/db");
const User = require("./models/User");
const Price = require("./models/Price");

connectDB();

// Initialize default prices if not already in the database
async function initializePrices() {
  const defaultPrices = [
    { type: "premium_3_months", value: 175000 },
    { type: "premium_6_months", value: 240000 },
    { type: "premium_12_months", value: 405000 },
    { type: "star_per_unit", value: 240 },
  ];

  for (const price of defaultPrices) {
    const existingPrice = await Price.findOne({ type: price.type });
    if (!existingPrice) {
      await Price.create(price);
    }
  }
}

initializePrices();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const BOT_USERNAME = process.env.BOT_USERNAME;
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME;

const userSteps = {}; // Tracks phone number step
const userStates = {}; // Tracks user state for multi-step processes
const referralMap = {}; // Tracks referral IDs

// /start command with optional referral
bot.onText(/\/start(?:\?ref=(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const referrerId = match[1];

  // Admin check
  if (userId === ADMIN_CHAT_ID) {
    return sendAdminPanel(chatId);
  }

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

  await bot.sendMessage(chatId, "📲 Telefon raqamingizni yuboring (faqat +998).", { reply_markup: keyboard });
});

// Handle contact (phone number) submission
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.contact.user_id;

  if (userSteps[chatId]?.step !== 'waiting_for_phone') return;

  const phone = msg.contact.phone_number;
  if (!phone.startsWith('+998')) {
    return bot.sendMessage(chatId, "❌ Faqat +998 bilan boshlanuvchi O‘zbekiston raqamlari qabul qilinadi.");
  }


  const status = await checkChannelMembership(userId);
  if (!["member", "creator", "administrator"].includes(status)) {
    return bot.sendMessage(
      chatId,
      `❗️Avval ${REQUIRED_CHANNEL} kanaliga a’zo bo‘ling!`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔗 Kanalga o'tish",
                url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}`,
              },
              { text: "✅ A'zo bo‘ldim", callback_data: "check_subscription" },
            ],
          ],
        },
      }
    );
  }

  const newUser = await User.create({
    telegramId: userId,
    phoneNumber: phone,
    username: msg.from.username || "",
    firstName: msg.from.first_name || "",
    referralBy: referralMap[userId] || null,
    starsEarned: 0,
  });

  if (referralMap[userId]) {
    const refUser = await User.findOne({ telegramId: referralMap[userId] });
    if (refUser) {
      refUser.starsEarned = (refUser.starsEarned || 0) + 1;
      await refUser.save();
      await bot.sendMessage(
        refUser.telegramId,
        `✅ Sizga 1 ta ⭐ qo‘shildi! Jami: ${refUser.starsEarned} ⭐`
      );
    }
  }

  delete userSteps[chatId];
  delete referralMap[userId];
  await sendMainMenu(chatId);
});

// Handle contact (phone number) submission
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.contact.user_id;

  if (userSteps[chatId]?.step !== "waiting_for_phone") {
    console.log("Invalid step, expected 'waiting_for_phone'");
    return;
  }

  let phone = msg.contact.phone_number;
  console.log("Raw phone number:", phone); // Debug: Log raw phone number

  // Normalize phone number: remove spaces, dashes, and other characters
  phone = phone.replace(/[\s-]/g, "");
  // Ensure the phone number starts with +998
  if (!phone.startsWith("+998")) {
    if (phone.startsWith("998")) {
      phone = `+${phone}`;
    } else {
      console.log("Invalid phone number, does not start with +998 or 998:", phone);
      return bot.sendMessage(
        chatId,
        "❌ Faqat +998 bilan boshlanuvchi O‘zbekiston raqamlari qabul qilinadi."
      );
    }
  }

  console.log("Normalized phone number:", phone); // Debug: Log normalized phone number

  const status = await checkChannelMembership(userId);
  if (!["member", "creator", "administrator"].includes(status)) {
    return bot.sendMessage(
      chatId,
      `❗️Avval ${REQUIRED_CHANNEL} kanaliga a’zo bo‘ling!`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "🔗 Kanalga o'tish",
                url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}`,
              },
              { text: "✅ A'zo bo‘ldim", callback_data: "check_subscription" },
            ],
          ],
        },
      }
    );
  }

  const newUser = await User.create({
    telegramId: userId,
    phoneNumber: phone,
    username: msg.from.username || "",
    firstName: msg.from.first_name || "",
    referralBy: referralMap[userId] || null,
    starsEarned: 0,
  });

  if (referralMap[userId]) {
    const refUser = await User.findOne({ telegramId: referralMap[userId] });
    if (refUser) {
      refUser.starsEarned = (refUser.starsEarned || 0) + 1;
      await refUser.save();
      await bot.sendMessage(
        refUser.telegramId,
        `✅ Sizga 1 ta ⭐ qo‘shildi! Jami: ${refUser.starsEarned} ⭐`
      );
    }
  }

  delete userSteps[chatId];
  delete referralMap[userId];
  await sendMainMenu(chatId);
});

// Handle callback queries
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (data === "check_subscription") {
    const status = await checkChannelMembership(userId);
    if (["member", "creator", "administrator"].includes(status)) {
      await bot.answerCallbackQuery(query.id, { text: "✅ Tasdiqlandi!" });
      return sendMainMenu(chatId);
    } else {
      await bot.answerCallbackQuery(query.id, {
        text: "❌ Siz hali a’zo emassiz.",
      });
    }
  }

  if (data === "back_to_main") {
    delete userStates[chatId];
    return userId === ADMIN_CHAT_ID
      ? sendAdminPanel(chatId)
      : sendMainMenu(chatId);
  }
});

// Main menu function
function sendMainMenu(chatId) {
  return bot.sendMessage(chatId, "✅ Endi xizmat turini tanlang:", {
    reply_markup: {
      keyboard: [
        ["⭐ Premium sotib olish", "💎 Stars sotib olish"],
        ["👥 Stars ishlash", "🚘 Support"],
      ],
      resize_keyboard: true,
    },
  });
}

// Admin panel function
function sendAdminPanel(chatId) {
  return bot.sendMessage(chatId, "🛠 Admin paneliga xush kelibsiz", {
    reply_markup: {
      keyboard: [
        ["📋 Barcha foydalanuvchilar"],
        ["🔍 Foydalanuvchini ID bo‘yicha topish"],
        ["💰 To‘lovlar tarixi"],
        ["💵 Narxlarni o‘zgartirish"],
      ],
      resize_keyboard: true,
    },
  });
}

// Check channel membership
async function checkChannelMembership(userId) {
  try {
    const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
    return res.status;
  } catch (err) {
    console.error("Kanal tekshirishda xatolik:", err.message);
    return "left";
  }
}

// Fetch prices from database
async function getPrices() {
  const prices = await Price.find({});
  const priceMap = {
    "3 oy": 175000,
    "6 oy": 240000,
    "1 yil": 405000,
    star_per_unit: 240,
  };

  prices.forEach((p) => {
    if (p.type === "premium_3_months") priceMap["3 oy"] = p.value;
    if (p.type === "premium_6_months") priceMap["6 oy"] = p.value;
    if (p.type === "premium_12_months") priceMap["1 yil"] = p.value;
    if (p.type === "star_per_unit") priceMap.star_per_unit = p.value;
  });

  return priceMap;
}

// Handle text messages
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim();
  if (!text) return;

  // Unified back handling
  if (text === "🔙 Ortga") {
    delete userStates[chatId];
    delete userSteps[chatId]; // Clear steps when going back
    return userId === ADMIN_CHAT_ID
      ? sendAdminPanel(chatId)
      : sendMainMenu(chatId);
  }

  // Admin-specific commands
  if (userId === ADMIN_CHAT_ID) {
    if (text === "📋 Barcha foydalanuvchilar") {
      const users = await User.find().limit(50);
      const formatted = users
        .map(
          (u) =>
            `👤 ${u.firstName} | @${u.username || "-"} | ID: ${u.telegramId} | ⭐ ${u.starsEarned}`
        )
        .join("\n");
      return bot.sendMessage(
        chatId,
        formatted || "🚫 Hech qanday foydalanuvchi topilmadi.",
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
    }

    if (text === "🔍 Foydalanuvchini ID bo‘yicha topish") {
      userStates[chatId] = { step: "search_by_id" };
      return bot.sendMessage(
        chatId,
        "🔢 Foydalanuvchining Telegram ID sini yuboring:",
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
    }

    if (userStates[chatId]?.step === "search_by_id") {
      const target = await User.findOne({ telegramId: Number(text) });
      if (!target) {
        return bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi.", {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        });
      }

      userStates[chatId] = {
        step: "adjust_stars",
        targetId: target.telegramId,
      };
      return bot.sendMessage(
        chatId,
        `👤 ${target.firstName}\nID: ${target.telegramId}\n⭐ Yulduz: ${target.starsEarned}\n\nQo'shmoqchi bo'lgan yulduzlar sonini yuboring (masalan, 10):`,
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
    }

    if (userStates[chatId]?.step === "adjust_stars") {
      const amount = parseInt(text);
      if (isNaN(amount) || amount <= 0) {
        return bot.sendMessage(
          chatId,
          "❌ Iltimos, 0 dan katta to‘g‘ri raqam kiriting (masalan, 10).",
          {
            reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
          }
        );
      }

      const targetId = userStates[chatId].targetId;
      const user = await User.findOne({ telegramId: targetId });
      if (!user) {
        return bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi.", {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        });
      }

      user.starsEarned += amount;
      await user.save();

      await bot.sendMessage(
        chatId,
        `✅ ${amount} ta yulduz qo‘shildi. Yangi balans: ${user.starsEarned} ⭐`,
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
      await bot.sendMessage(
        targetId,
        `🎁 Sizga ${amount} ta yulduz qo‘shildi! Yangi balans: ${user.starsEarned} ⭐`
      );

      delete userStates[chatId];
      return sendAdminPanel(chatId);
    }

    if (text === "💰 To‘lovlar tarixi") {
      return bot.sendMessage(
        chatId,
        "💳 Hozircha to‘lovlar tarixi bo‘limi ishlab chiqilmoqda.",
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
    }

    if (text === "💵 Narxlarni o‘zgartirish") {
      const prices = await getPrices();
      userStates[chatId] = { step: "select_price_type" };
      return bot.sendMessage(
        chatId,
        `📋 Joriy narxlar:\n\n` +
        `Premium 3 oy: ${prices["3 oy"]} so'm\n` +
        `Premium 6 oy: ${prices["6 oy"]} so'm\n` +
        `Premium 1 yil: ${prices["1 yil"]} so'm\n` +
        `1 ta yulduz: ${prices.star_per_unit} so'm\n\n` +
        `O‘zgartirmoqchi bo‘lgan narx turini tanlang:`,
        {
          reply_markup: {
            keyboard: [
              ["📦 Premium 3 oy", "📦 Premium 6 oy"],
              ["📦 Premium 1 yil", "💎 Yulduz narxi"],
              ["🔙 Ortga"],
            ],
            resize_keyboard: true,
          },
        }
      );
    }

    if (userStates[chatId]?.step === "select_price_type") {
      const priceTypeMap = {
        "📦 Premium 3 oy": "premium_3_months",
        "📦 Premium 6 oy": "premium_6_months",
        "📦 Premium 1 yil": "premium_12_months",
        "💎 Yulduz narxi": "star_per_unit",
      };

      const selectedType = priceTypeMap[text];
      if (!selectedType) {
        return bot.sendMessage(
          chatId,
          "❌ Noto‘g‘ri tanlov. Iltimos, ro‘yxatdan tanlang.",
          {
            reply_markup: {
              keyboard: [
                ["📦 Premium 3 oy", "📦 Premium 6 oy"],
                ["📦 Premium 1 yil", "💎 Yulduz narxi"],
                ["🔙 Ortga"],
              ],
              resize_keyboard: true,
            },
          }
        );
      }

      userStates[chatId] = { step: "update_price", priceType: selectedType };
      return bot.sendMessage(
        chatId,
        `Yangi narxni so‘mda kiriting (masalan, 175000):`,
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
    }

    if (userStates[chatId]?.step === "update_price") {
      const newPrice = parseInt(text);
      if (isNaN(newPrice) || newPrice <= 0) {
        return bot.sendMessage(
          chatId,
          "❌ Iltimos, 0 dan katta to‘g‘ri raqam kiriting (masalan, 175000).",
          {
            reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
          }
        );
      }

      const priceType = userStates[chatId].priceType;
      await Price.updateOne(
        { type: priceType },
        { value: newPrice },
        { upsert: true }
      );

      const priceTypeDisplay = {
        premium_3_months: "Premium 3 oy",
        premium_6_months: "Premium 6 oy",
        premium_12_months: "Premium 1 yil",
        star_per_unit: "Yulduz narxi",
      };

      await bot.sendMessage(
        chatId,
        `✅ ${priceTypeDisplay[priceType]} narxi ${newPrice} so‘mga o‘zgartirildi.`,
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
      delete userStates[chatId];
      return sendAdminPanel(chatId);
    }
  }

  // Stars earning (referral link)
  if (text === "👥 Stars ishlash") {
    return bot.sendMessage(
      chatId,
      `👥 Do‘stlaringizni taklif qilib yutib oling!\n\nSizning referal havolangiz:\nhttps://t.me/${BOT_USERNAME}?start=ref${chatId}\n\nHar bir do‘st telefon raqamini yuborsa sizga 1 ⭐ beriladi. 50⭐ dan keyin almashtirish mumkin!`,
      {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      }
    );
  }

  // Stars purchase
  if (text === "💎 Stars sotib olish") {
    userStates[chatId] = { step: "waiting_for_star_amount" };
    return bot.sendMessage(
      chatId,
      "Yozing nechta star kerak? (Minimal 50 ta, maksimal 5000 ta)",
      {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      }
    );
  }

  if (userStates[chatId]?.step === "waiting_for_star_amount") {
    const count = parseInt(text);
    if (isNaN(count) || count < 50 || count > 5000) {
      return bot.sendMessage(
        chatId,
        "❌ Stars miqdori 50-5000 oralig'ida bo'lishi kerak.",
        {
          reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
        }
      );
    }

    const starPrice =
      (await Price.findOne({ type: "star_per_unit" }))?.value || 240;
    const price = count * starPrice;
    userStates[chatId] = {
      step: "waiting_for_star_recipient",
      starAmount: count,
      price,
    };
    return bot.sendMessage(
      chatId,
      `⭐ ${count} ta star narxi: ${price} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`,
      {
        reply_markup: {
          keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
          resize_keyboard: true,
        },
      }
    );
  }

  if (userStates[chatId]?.step === "waiting_for_star_recipient") {
    let recipient = text.trim();
    if (recipient === "🙋‍♂️ O‘zimga") {
      recipient = `@${msg.from.username || "nomalum"}`;
    } else if (!recipient.startsWith("@")) {
      recipient = `@${recipient}`;
    }

    const { starAmount, price } = userStates[chatId];
    delete userStates[chatId];

    await bot.sendMessage(
      ADMIN_CHAT_ID,
      `💎 STARS BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n⭐ Miqdor: ${starAmount} ta\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`
    );

    return bot.sendMessage(
      chatId,
      `✅ Buyurtma tayyor!\n\n⭐ ${starAmount} ta star\nNarxi: ${price} so'm\nKimga: ${recipient}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "💳 Click orqali to'lash",
                url: "https://t.me/m/8YE5e4r-MzAy",
              },
              {
                text: "💳 Paynet orqali to'lash",
                url: "https://t.me/m/8YE5e4r-MzAy",
              },
            ],
            [{ text: "🔙 Ortga", callback_data: "back_to_main" }],
          ],
        },
      }
    );
  }

  // Premium purchase
  if (text === "⭐ Premium sotib olish") {
    userStates[chatId] = { step: "choosing_package" };
    const prices = await getPrices();
    return bot.sendMessage(
      chatId,
      `⚠️ <b>PREMIUM NARXLARI 🧙</b>\n\n` +
      `🎁3 oylik - ${prices["3 oy"]} so’m\n` +
      `🎁6 oylik - ${prices["6 oy"]} so’m\n` +
      `🎁12 oylik - ${prices["1 yil"]} so’m`,
      {
        parse_mode: "HTML",
        reply_markup: {
          keyboard: [
            ["📦 3 oy", "📦 6 oy"],
            ["📦 1 yil", "🔙 Ortga"],
          ],
          resize_keyboard: true,
        },
      }
    );
  }

  if (userStates[chatId]?.step === "choosing_package" && text.startsWith("📦")) {
    const chosen = text.replace("📦 ", "").trim();
    const prices = await getPrices();

    if (!prices[chosen])
      return bot.sendMessage(chatId, "❌ Noto‘g‘ri paket.", {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      });

    userStates[chatId] = {
      step: "choosing_recipient",
      selectedPackage: chosen,
      price: prices[chosen],
    };
    return bot.sendMessage(
      chatId,
      `Premium: ${chosen}\nNarxi: ${prices[chosen]} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`,
      {
        reply_markup: {
          keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
          resize_keyboard: true,
        },
      }
    );
  }

  if (userStates[chatId]?.step === "choosing_recipient") {
    let recipient = text.trim();
    if (recipient === "🙋‍♂️ O‘zimga") {
      recipient = `@${msg.from.username || "nomalum"}`;
    } else if (!recipient.startsWith("@")) {
      recipient = `@${recipient}`;
    }

    const { selectedPackage, price } = userStates[chatId];
    delete userStates[chatId];

    await bot.sendMessage(
      ADMIN_CHAT_ID,
      `🚕 PREMIUM BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n🎓 Paket: ${selectedPackage}\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`
    );

    return bot.sendMessage(
      chatId,
      `✅ Buyurtma tayyor!\n\nPaket: ${selectedPackage}\nNarxi: ${price} so'm\nKimga: ${recipient}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "💳 Click orqali to'lash",
                url: "https://t.me/m/8YE5e4r-MzAy",
              },
              {
                text: "💳 Paynet orqali to'lash",
                url: "https://t.me/m/8YE5e4r-MzAy",
              },
            ],
            [{ text: "🔙 Ortga", callback_data: "back_to_main" }],
          ],
        },
      }
    );
  }

  if (text === "🚘 Support") {
    return bot.sendMessage(
      chatId,
      `📞 Admin bilan bog‘lanish uchun quyidagi tugmani bosing:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "👨‍💻 Admin bilan bog‘lanish",
                url: `https://t.me/${SUPPORT_USERNAME}`,
              },
            ],
          ],
        },
      }
    );
  }
});

// Invalid phone number format handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (userSteps[chatId]?.step === "waiting_for_manual_phone" && text && !/^\+998\d{9}$/.test(text)) {
    return bot.sendMessage(
      chatId,
      "❌ Noto‘g‘ri format. Iltimos, telefon raqamingizni +998 bilan boshlanadigan va 12 raqamdan iborat holda kiriting (masalan, +998901234567).",
      {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      }
    );
  }
});

const express = require("express");
const app = express();
const paynetRouter = require("./router"); // Ensure correct path to router

app.use(express.json());
app.use("/api/paynet", paynetRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server ${PORT}-portda ishga tushdi`));











// require('dotenv').config();
// const TelegramBot = require('node-telegram-bot-api');
// const mongoose = require('mongoose');
// const connectDB = require('./db/db');
// const User = require('./models/User');
// const Price = require('./models/Price');

// connectDB();

// // Initialize default prices if not already in the database
// async function initializePrices() {
//     const defaultPrices = [
//         { type: 'premium_3_months', value: 175000 },
//         { type: 'premium_6_months', value: 240000 },
//         { type: 'premium_12_months', value: 405000 },
//         { type: 'star_per_unit', value: 240 }
//     ];

//     for (const price of defaultPrices) {
//         const existingPrice = await Price.findOne({ type: price.type });
//         if (!existingPrice) {
//             await Price.create(price);
//         }
//     }
// }

// initializePrices();

// const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
// const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
// const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
// const BOT_USERNAME = process.env.BOT_USERNAME;
// const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME;

// const userSteps = {}; // Tracks phone number step
// const userStates = {}; // Tracks user state for multi-step processes
// const referralMap = {}; // Tracks referral IDs

// // /start command with optional referral
// bot.onText(/\/start(?:\?ref=(\d+))?/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const referrerId = match[1];

//     // Admin check
//     if (userId === ADMIN_CHAT_ID) {
//         return sendAdminPanel(chatId);
//     }

//     const existingUser = await User.findOne({ telegramId: userId });
//     if (existingUser) {
//         return sendMainMenu(chatId);
//     }

//     if (referrerId) {
//         referralMap[userId] = referrerId;
//         await bot.sendMessage(referrerId, "🆕 Sizda yangi taklif mavjud!");
//     }

//     userSteps[chatId] = { step: 'waiting_for_phone' };
//     const keyboard = {
//         keyboard: [[{ text: "📞 Telefon raqamni yuborish", request_contact: true }]],
//         resize_keyboard: true,
//         one_time_keyboard: true,
//     };

//     await bot.sendMessage(chatId, "📲 Telefon raqamingizni yuboring (faqat +998).", { reply_markup: keyboard });
// });

// // Handle contact (phone number) submission
// bot.on('contact', async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.contact.user_id;

//     if (userSteps[chatId]?.step !== 'waiting_for_phone') return;

//     const phone = msg.contact.phone_number;
//     if (!phone.startsWith('+998')) {
//         return bot.sendMessage(chatId, "❌ Faqat +998 bilan boshlanuvchi O‘zbekiston raqamlari qabul qilinadi.");
//     }

//     const status = await checkChannelMembership(userId);
//     if (!['member', 'creator', 'administrator'].includes(status)) {
//         return bot.sendMessage(chatId, `❗️Avval ${REQUIRED_CHANNEL} kanaliga a’zo bo‘ling!`, {
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: "🔗 Kanalga o'tish", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` },
//                     { text: "✅ A'zo bo‘ldim", callback_data: "check_subscription" }
//                 ]]
//             }
//         });
//     }

//     const newUser = await User.create({
//         telegramId: userId,
//         phoneNumber: phone,
//         username: msg.from.username || '',
//         firstName: msg.from.first_name || '',
//         referralBy: referralMap[userId] || null,
//         starsEarned: 0
//     });

//     if (referralMap[userId]) {
//         const refUser = await User.findOne({ telegramId: referralMap[userId] });
//         if (refUser) {
//             refUser.starsEarned = (refUser.starsEarned || 0) + 1;
//             await refUser.save();
//             await bot.sendMessage(refUser.telegramId, `✅ Sizga 1 ta ⭐ qo‘shildi! Jami: ${refUser.starsEarned} ⭐`);
//         }
//     }

//     delete userSteps[chatId];
//     delete referralMap[userId];
//     await sendMainMenu(chatId);
// });

// // Handle callback queries
// bot.on("callback_query", async (query) => {
//     const chatId = query.message.chat.id;
//     const userId = query.from.id;
//     const data = query.data;

//     if (data === "check_subscription") {
//         const status = await checkChannelMembership(userId);
//         if (["member", "creator", "administrator"].includes(status)) {
//             await bot.answerCallbackQuery(query.id, { text: "✅ Tasdiqlandi!" });
//             return sendMainMenu(chatId);
//         } else {
//             await bot.answerCallbackQuery(query.id, { text: "❌ Siz hali a’zo emassiz." });
//         }
//     }

//     if (data === "back_to_main" || data === "cancel_order") {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }
// });

// // Main menu function
// function sendMainMenu(chatId) {
//     return bot.sendMessage(chatId, "✅ Endi xizmat turini tanlang:", {
//         reply_markup: {
//             keyboard: [
//                 ["⭐ Premium sotib olish", "💎 Stars sotib olish"],
//                 ["👥 Stars ishlash", "🚘 Support"]
//             ],
//             resize_keyboard: true
//         }
//     });
// }

// // Admin panel function
// function sendAdminPanel(chatId) {
//     return bot.sendMessage(chatId, "🛠 Admin paneliga xush kelibsiz", {
//         reply_markup: {
//             keyboard: [
//                 ["📋 Barcha foydalanuvchilar"],
//                 ["🔍 Foydalanuvchini ID bo‘yicha topish"],
//                 ["💰 To‘lovlar tarixi"],
//                 ["💵 Narxlarni o‘zgartirish"]
//             ],
//             resize_keyboard: true
//         }
//     });
// }

// // Check channel membership
// async function checkChannelMembership(userId) {
//     try {
//         const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
//         return res.status;
//     } catch (err) {
//         console.error("Kanal tekshirishda xatolik:", err.message);
//         return 'left';
//     }
// }

// // Fetch prices from database
// async function getPrices() {
//     const prices = await Price.find({});
//     const priceMap = {
//         "3 oy": 175000,
//         "6 oy": 240000,
//         "1 yil": 405000,
//         star_per_unit: 240
//     };

//     prices.forEach(p => {
//         if (p.type === 'premium_3_months') priceMap["3 oy"] = p.value;
//         if (p.type === 'premium_6_months') priceMap["6 oy"] = p.value;
//         if (p.type === 'premium_12_months') priceMap["1 yil"] = p.value;
//         if (p.type === 'star_per_unit') priceMap.star_per_unit = p.value;
//     });

//     return priceMap;
// }

// // Handle text messages
// bot.on('message', async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const text = msg.text?.trim();
//     if (!text) return;

//     // Admin-specific commands
//     if (userId === ADMIN_CHAT_ID) {
//         if (text === "📋 Barcha foydalanuvchilar") {
//             const users = await User.find().limit(50);
//             const formatted = users.map(u => `👤 ${u.firstName} | @${u.username || '-'} | ID: ${u.telegramId} | ⭐ ${u.starsEarned}`).join("\n");
//             return bot.sendMessage(chatId, formatted || "🚫 Hech qanday foydalanuvchi topilmadi.");
//         }

//         if (text === "🔍 Foydalanuvchini ID bo‘yicha topish") {
//             userStates[chatId] = { step: "search_by_id" };
//             return bot.sendMessage(chatId, "🔢 Foydalanuvchining Telegram ID sini yuboring:");
//         }

//         if (userStates[chatId]?.step === "search_by_id") {
//             const target = await User.findOne({ telegramId: Number(text) });
//             if (!target) {
//                 return bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi.");
//             }

//             userStates[chatId] = { step: "adjust_stars", targetId: target.telegramId };
//             return bot.sendMessage(chatId, `👤 ${target.firstName}\nID: ${target.telegramId}\n⭐ Yulduz: ${target.starsEarned}\n\nQo'shmoqchi bo'lgan yulduzlar sonini yuboring (masalan, 10):`, {
//                 reply_markup: {
//                     keyboard: [["🔙 Ortga"]],
//                     resize_keyboard: true
//                 }
//             });
//         }

//         if (userStates[chatId]?.step === "adjust_stars") {
//             const amount = parseInt(text);
//             if (isNaN(amount) || amount <= 0) {
//                 return bot.sendMessage(chatId, "❌ Iltimos, 0 dan katta to‘g‘ri raqam kiriting (masalan, 10).");
//             }

//             const targetId = userStates[chatId].targetId;
//             const user = await User.findOne({ telegramId: targetId });
//             if (!user) {
//                 return bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi.");
//             }

//             user.starsEarned += amount;
//             await user.save();

//             await bot.sendMessage(chatId, `✅ ${amount} ta yulduz qo‘shildi. Yangi balans: ${user.starsEarned} ⭐`);
//             await bot.sendMessage(targetId, `🎁 Sizga ${amount} ta yulduz qo‘shildi! Yangi balans: ${user.starsEarned} ⭐`);

//             delete userStates[chatId];
//             return sendAdminPanel(chatId);
//         }

//         if (text === "💰 To‘lovlar tarixi") {
//             return bot.sendMessage(chatId, "💳 Hozircha to‘lovlar tarixi bo‘limi ishlab chiqilmoqda.");
//         }

//         if (text === "💵 Narxlarni o‘zgartirish") {
//             const prices = await getPrices();
//             userStates[chatId] = { step: "select_price_type" };
//             return bot.sendMessage(chatId, `📋 Joriy narxlar:\n\n` +
//                 `Premium 3 oy: ${prices["3 oy"]} so'm\n` +
//                 `Premium 6 oy: ${prices["6 oy"]} so'm\n` +
//                 `Premium 1 yil: ${prices["1 yil"]} so'm\n` +
//                 `1 ta yulduz: ${prices.star_per_unit} so'm\n\n` +
//                 `O‘zgartirmoqchi bo‘lgan narx turini tanlang:`, {
//                 reply_markup: {
//                     keyboard: [
//                         ["📦 Premium 3 oy", "📦 Premium 6 oy"],
//                         ["📦 Premium 1 yil", "💎 Yulduz narxi"],
//                         ["🔙 Ortga"]
//                     ],
//                     resize_keyboard: true
//                 }
//             });
//         }

//         if (userStates[chatId]?.step === "select_price_type") {
//             const priceTypeMap = {
//                 "📦 Premium 3 oy": "premium_3_months",
//                 "📦 Premium 6 oy": "premium_6_months",
//                 "📦 Premium 1 yil": "premium_12_months",
//                 "💎 Yulduz narxi": "star_per_unit"
//             };

//             const selectedType = priceTypeMap[text];
//             if (!selectedType) {
//                 return bot.sendMessage(chatId, "❌ Noto‘g‘ri tanlov. Iltimos, ro‘yxatdan tanlang.");
//             }

//             userStates[chatId] = { step: "update_price", priceType: selectedType };
//             return bot.sendMessage(chatId, `Yangi narxni so‘mda kiriting (masalan, 175000):`, {
//                 reply_markup: {
//                     keyboard: [["🔙 Ortga"]],
//                     resize_keyboard: true
//                 }
//             });
//         }

//         if (userStates[chatId]?.step === "update_price") {
//             const newPrice = parseInt(text);
//             if (isNaN(newPrice) || newPrice <= 0) {
//                 return bot.sendMessage(chatId, "❌ Iltimos, 0 dan katta to‘g‘ri raqam kiriting (masalan, 175000).");
//             }

//             const priceType = userStates[chatId].priceType;
//             await Price.updateOne({ type: priceType }, { value: newPrice }, { upsert: true });

//             const priceTypeDisplay = {
//                 premium_3_months: "Premium 3 oy",
//                 premium_6_months: "Premium 6 oy",
//                 premium_12_months: "Premium 1 yil",
//                 star_per_unit: "Yulduz narxi"
//             };

//             await bot.sendMessage(chatId, `✅ ${priceTypeDisplay[priceType]} narxi ${newPrice} so‘mga o‘zgartirildi.`);
//             delete userStates[chatId];
//             return sendAdminPanel(chatId);
//         }
//     }

//     // Handle back/cancel
//     if (text === "🔙 Ortga" || text === "❌ Bekor qilish") {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     // Stars earning (referral link)
//     if (text === "👥 Stars ishlash") {
//         return bot.sendMessage(chatId, `👥 Do‘stlaringizni taklif qilib yutib oling!\n\nSizning referal havolangiz:\nhttps://t.me/${BOT_USERNAME}?start=ref${chatId}\n\nHar bir do‘st telefon raqamini yuborsa sizga 1 ⭐ beriladi. 50⭐ dan keyin almashtirish mumkin!`);
//     }

//     // Stars purchase
//     if (text === "💎 Stars sotib olish") {
//         userStates[chatId] = { step: 'waiting_for_star_amount' };
//         return bot.sendMessage(chatId, "Yozing nechta star kerak? (Minimal 50 ta, maksimal 5000 ta)");
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_amount') {
//         const count = parseInt(text);
//         if (isNaN(count) || count < 50 || count > 5000) {
//             return bot.sendMessage(chatId, "❌ Stars miqdori 50-5000 oralig'ida bo'lishi kerak.");
//         }

//         const starPrice = (await Price.findOne({ type: 'star_per_unit' }))?.value || 240;
//         const price = count * starPrice;
//         userStates[chatId] = { step: 'waiting_for_star_recipient', starAmount: count, price };
//         return bot.sendMessage(chatId, `⭐ ${count} ta star narxi: ${price} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
//             reply_markup: {
//                 keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_recipient') {
//         let recipient = text.trim();
//         if (recipient === "🙋‍♂️ O‘zimga") {
//             recipient = `@${msg.from.username || "nomalum"}`;
//         } else if (!recipient.startsWith('@')) {
//             recipient = `@${recipient}`;
//         }

//         const { starAmount, price } = userStates[chatId];
//         delete userStates[chatId];

//         await bot.sendMessage(ADMIN_CHAT_ID, `💎 STARS BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n⭐ Miqdor: ${starAmount} ta\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

//         return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\n⭐ ${starAmount} ta star\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
//             reply_markup: {
//                 inline_keyboard: [
//                     [
//                         { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
//                         { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
//                     ],
//                     [
//                         { text: "🔙 Ortga", callback_data: "back_to_main" },
//                         { text: "❌ Bekor qilish", callback_data: "cancel_order" }
//                     ]
//                 ]
//             }
//         });
//     }

//     // Premium purchase
//     if (text === "⭐ Premium sotib olish") {
//         userStates[chatId] = { step: 'choosing_package' };
//         const prices = await getPrices();
//         return bot.sendMessage(chatId, `⚠️ <b>PREMIUM NARXLARI 🧙</b>\n\n` +
//             `🎁3 oylik - ${prices["3 oy"]} so’m\n` +
//             `🎁6 oylik - ${prices["6 oy"]} so’m\n` +
//             `🎁12 oylik - ${prices["1 yil"]} so’m`, {
//             parse_mode: "HTML",
//             reply_markup: {
//                 keyboard: [
//                     ["📦 3 oy", "📦 6 oy"],
//                     ["📦 1 yil", "🔙 Ortga"]
//                 ],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'choosing_package' && text.startsWith("📦")) {
//         const chosen = text.replace("📦 ", "").trim();
//         const prices = await getPrices();

//         if (!prices[chosen]) return bot.sendMessage(chatId, "❌ Noto‘g‘ri paket.");

//         userStates[chatId] = { step: 'choosing_recipient', selectedPackage: chosen, price: prices[chosen] };
//         return bot.sendMessage(chatId, `Premium: ${chosen}\nNarxi: ${prices[chosen]} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
//             reply_markup: {
//                 keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'choosing_recipient') {
//         let recipient = text.trim();
//         if (recipient === "🙋‍♂️ O‘zimga") {
//             recipient = `@${msg.from.username || "nomalum"}`;
//         } else if (!recipient.startsWith('@')) {
//             recipient = `@${recipient}`;
//         }

//         const { selectedPackage, price } = userStates[chatId];
//         delete userStates[chatId];

//         await bot.sendMessage(ADMIN_CHAT_ID, `🚕 PREMIUM BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n🎓 Paket: ${selectedPackage}\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

//         return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\nPaket: ${selectedPackage}\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
//             reply_markup: {
//                 inline_keyboard: [
//                     [
//                         { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
//                         { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
//                     ],
//                     [
//                         { text: "🔙 Ortga", callback_data: "back_to_main" },
//                         { text: "❌ Bekor qilish", callback_data: "cancel_order" }
//                     ]
//                 ]
//             }
//         });
//     }

//     if (text === "🚘 Support") {
//         return bot.sendMessage(chatId, `📞 Admin bilan bog‘lanish uchun quyidagi tugmani bosing:`, {
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: "👨‍💻 Admin bilan bog‘lanish", url: `https://t.me/${SUPPORT_USERNAME}` }
//                 ]]
//             }
//         });
//     }
// });







// require('dotenv').config();
// const TelegramBot = require('node-telegram-bot-api');
// const mongoose = require('mongoose');
// const connectDB = require('./db/db');
// const User = require('./models/User');

// connectDB();

// const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
// const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
// const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
// const BOT_USERNAME = process.env.BOT_USERNAME;
// const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME;

// const userSteps = {}; // Tracks phone number step
// const userStates = {}; // Tracks user state for multi-step processes
// const referralMap = {}; // Tracks referral IDs

// // /start command with optional referral
// bot.onText(/\/start(?:\?ref=(\d+))?/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const referrerId = match[1];

//     // Admin check
//     if (userId === ADMIN_CHAT_ID) {
//         return sendAdminPanel(chatId);
//     }

//     const existingUser = await User.findOne({ telegramId: userId });
//     if (existingUser) {
//         return sendMainMenu(chatId);
//     }

//     if (referrerId) {
//         referralMap[userId] = referrerId;
//         await bot.sendMessage(referrerId, "🆕 Sizda yangi taklif mavjud!");
//     }

//     userSteps[chatId] = { step: 'waiting_for_phone' };
//     const keyboard = {
//         keyboard: [[{ text: "📞 Telefon raqamni yuborish", request_contact: true }]],
//         resize_keyboard: true,
//         one_time_keyboard: true,
//     };

//     await bot.sendMessage(chatId, "📲 Telefon raqamingizni yuboring (faqat +998).", { reply_markup: keyboard });
// });

// // Handle contact (phone number) submission
// bot.on('contact', async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.contact.user_id;

//     if (userSteps[chatId]?.step !== 'waiting_for_phone') return;

//     const phone = msg.contact.phone_number;
//     if (!phone.startsWith('+998')) {
//         return bot.sendMessage(chatId, "❌ Faqat +998 bilan boshlanuvchi O‘zbekiston raqamlari qabul qilinadi.");
//     }

//     const status = await checkChannelMembership(userId);
//     if (!['member', 'creator', 'administrator'].includes(status)) {
//         return bot.sendMessage(chatId, `❗️Avval ${REQUIRED_CHANNEL} kanaliga a’zo bo‘ling!`, {
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: "🔗 Kanalga o'tish", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` },
//                     { text: "✅ A'zo bo‘ldim", callback_data: "check_subscription" }
//                 ]]
//             }
//         });
//     }

//     const newUser = await User.create({
//         telegramId: userId,
//         phoneNumber: phone,
//         username: msg.from.username || '',
//         firstName: msg.from.first_name || '',
//         referralBy: referralMap[userId] || null,
//         starsEarned: 0
//     });

//     if (referralMap[userId]) {
//         const refUser = await User.findOne({ telegramId: referralMap[userId] });
//         if (refUser) {
//             refUser.starsEarned = (refUser.starsEarned || 0) + 1;
//             await refUser.save();
//             await bot.sendMessage(refUser.telegramId, `✅ Sizga 1 ta ⭐ qo‘shildi! Jami: ${refUser.starsEarned} ⭐`);
//         }
//     }

//     delete userSteps[chatId];
//     delete referralMap[userId];
//     await sendMainMenu(chatId);
// });

// // Handle callback queries
// bot.on("callback_query", async (query) => {
//     const chatId = query.message.chat.id;
//     const userId = query.from.id;
//     const data = query.data;

//     if (data === "check_subscription") {
//         const status = await checkChannelMembership(userId);
//         if (["member", "creator", "administrator"].includes(status)) {
//             await bot.answerCallbackQuery(query.id, { text: "✅ Tasdiqlandi!" });
//             return sendMainMenu(chatId);
//         } else {
//             await bot.answerCallbackQuery(query.id, { text: "❌ Siz hali a’zo emassiz." });
//         }
//     }

//     if (data === "back_to_main" || data === "cancel_order") {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     if (data.startsWith("incr_")) {
//         const id = Number(data.split("_")[1]);
//         const user = await User.findOne({ telegramId: id });
//         if (user) {
//             user.starsEarned += 1;
//             await user.save();
//             await bot.sendMessage(chatId, `✅ 1 ta ⭐ qo‘shildi. Yangi balans: ${user.starsEarned}`);
//             await bot.sendMessage(id, "🎁 Sizga 1 ta ⭐ bonus berildi!");
//         }
//     }

//     if (data.startsWith("decr_")) {
//         const id = Number(data.split("_")[1]);
//         const user = await User.findOne({ telegramId: id });
//         if (user && user.starsEarned > 0) {
//             user.starsEarned -= 1;
//             await user.save();
//             await bot.sendMessage(chatId, `✅ 1 ta ⭐ olib tashlandi. Yangi balans: ${user.starsEarned}`);
//             await bot.sendMessage(id, "⚠️ Sizning hisobingizdan 1 ta ⭐ olib tashlandi.");
//         }
//     }
// });

// // Main menu function
// function sendMainMenu(chatId) {
//     return bot.sendMessage(chatId, "✅ Endi xizmat turini tanlang:", {
//         reply_markup: {
//             keyboard: [
//                 ["⭐ Premium sotib olish", "💎 Stars sotib olish"],
//                 ["👥 Stars ishlash", "🚘 Support"]
//             ],
//             resize_keyboard: true
//         }
//     });
// }

// // Admin panel function
// function sendAdminPanel(chatId) {
//     return bot.sendMessage(chatId, "🛠 Admin paneliga xush kelibsiz", {
//         reply_markup: {
//             keyboard: [
//                 ["📋 Barcha foydalanuvchilar"],
//                 ["🔍 Foydalanuvchini ID bo‘yicha topish"],
//                 ["💰 To‘lovlar tarixi"]
//             ],
//             resize_keyboard: true
//         }
//     });
// }

// // Check channel membership
// async function checkChannelMembership(userId) {
//     try {
//         const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
//         return res.status;
//     } catch (err) {
//         console.error("Kanal tekshirishda xatolik:", err.message);
//         return 'left';
//     }
// }

// // Handle text messages
// bot.on('message', async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const text = msg.text?.trim();
//     if (!text) return;

//     // Admin-specific commands
//     if (userId === ADMIN_CHAT_ID) {
//         if (text === "📋 Barcha foydalanuvchilar") {
//             const users = await User.find().limit(50);
//             const formatted = users.map(u => `👤 ${u.firstName} | @${u.username || '-'} | ID: ${u.telegramId} | ⭐ ${u.starsEarned}`).join("\n");
//             return bot.sendMessage(chatId, formatted || "🚫 Hech qanday foydalanuvchi topilmadi.");
//         }

//         if (text === "🔍 Foydalanuvchini ID bo‘yicha topish") {
//             userStates[chatId] = { step: "search_by_id" };
//             return bot.sendMessage(chatId, "🔢 Foydalanuvchining Telegram ID sini yuboring:");
//         }

//         if (userStates[chatId]?.step === "search_by_id") {
//             const target = await User.findOne({ telegramId: Number(text) });
//             if (!target) {
//                 return bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi.");
//             }

//             userStates[chatId] = { step: "adjust_stars", targetId: target.telegramId };
//             return bot.sendMessage(chatId, `👤 ${target.firstName}\nID: ${target.telegramId}\n⭐ Yulduz: ${target.starsEarned}\n\nQo'shmoqchi bo'lgan yulduzlar sonini yuboring (masalan, 10):`, {
//                 reply_markup: {
//                     keyboard: [["🔙 Ortga"]],
//                     resize_keyboard: true
//                 }
//             });
//         }

//         if (userStates[chatId]?.step === "adjust_stars") {
//             const amount = parseInt(text);
//             if (isNaN(amount) || amount <= 0) {
//                 return bot.sendMessage(chatId, "❌ Iltimos, 0 dan katta to‘g‘ri raqam kiriting (masalan, 10).");
//             }

//             const targetId = userStates[chatId].targetId;
//             const user = await User.findOne({ telegramId: targetId });
//             if (!user) {
//                 return bot.sendMessage(chatId, "❌ Foydalanuvchi topilmadi.");
//             }

//             user.starsEarned += amount;
//             await user.save();

//             await bot.sendMessage(chatId, `✅ ${amount} ta yulduz qo‘shildi. Yangi balans: ${user.starsEarned} ⭐`);
//             await bot.sendMessage(targetId, `🎁 Sizga ${amount} ta yulduz qo‘shildi! Yangi balans: ${user.starsEarned} ⭐`);

//             delete userStates[chatId];
//             return sendAdminPanel(chatId);
//         }

//         if (text === "💰 To‘lovlar tarixi") {
//             return bot.sendMessage(chatId, "💳 Hozircha to‘lovlar tarixi bo‘limi ishlab chiqilmoqda.");
//         }
//     }

//     // Handle back/cancel
//     if (text === "🔙 Ortga" || text === "❌ Bekor qilish") {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     // Stars earning (referral link)
//     if (text === "👥 Stars ishlash") {
//         return bot.sendMessage(chatId, `👥 Do‘stlaringizni taklif qilib yutib oling!\n\nSizning referal havolangiz:\nhttps://t.me/${BOT_USERNAME}?start=ref${chatId}\n\nHar bir do‘st telefon raqamini yuborsa sizga 1 ⭐ beriladi. 50⭐ dan keyin almashtirish mumkin!`);
//     }

//     // Stars purchase
//     if (text === "💎 Stars sotib olish") {
//         userStates[chatId] = { step: 'waiting_for_star_amount' };
//         return bot.sendMessage(chatId, "Yozing nechta star kerak? (Minimal 50 ta, maksimal 5000 ta)");
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_amount') {
//         const count = parseInt(text);
//         if (isNaN(count) || count < 50 || count > 5000) {
//             return bot.sendMessage(chatId, "❌ Stars miqdori 50-5000 oralig'ida bo'lishi kerak.");
//         }

//         const price = count * 240;
//         userStates[chatId] = { step: 'waiting_for_star_recipient', starAmount: count, price };
//         return bot.sendMessage(chatId, `⭐ ${count} ta star narxi: ${price} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
//             reply_markup: {
//                 keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_recipient') {
//         let recipient = text.trim();
//         if (recipient === "🙋‍♂️ O‘zimga") {
//             recipient = `@${msg.from.username || "nomalum"}`;
//         } else if (!recipient.startsWith('@')) {
//             recipient = `@${recipient}`;
//         }

//         const { starAmount, price } = userStates[chatId];
//         delete userStates[chatId];

//         await bot.sendMessage(ADMIN_CHAT_ID, `💎 STARS BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n⭐ Miqdor: ${starAmount} ta\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

//         return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\n⭐ ${starAmount} ta star\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
//             reply_markup: {
//                 inline_keyboard: [
//                     [
//                         { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
//                         { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
//                     ],
//                     [
//                         { text: "🔙 Ortga", callback_data: "back_to_main" },
//                         { text: "❌ Bekor qilish", callback_data: "cancel_order" }
//                     ]
//                 ]
//             }
//         });
//     }

//     // Premium purchase
//     if (text === "⭐ Premium sotib olish") {
//         userStates[chatId] = { step: 'choosing_package' };
//         return bot.sendMessage(chatId, `⚠️ <b>PREMIUM NARXLARI 🧙</b>\n\n🎁3 oylik - 175.000 so’m\n🎁6 oylik - 240.000 so’m\n🎁12 oylik - 405.000 so’m`, {
//             parse_mode: "HTML",
//             reply_markup: {
//                 keyboard: [
//                     ["📦 3 oy", "📦 6 oy"],
//                     ["📦 1 yil", "🔙 Ortga"]
//                 ],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'choosing_package' && text.startsWith("📦")) {
//         const chosen = text.replace("📦 ", "").trim();
//         const prices = {
//             "3 oy": 175000,
//             "6 oy": 240000,
//             "1 yil": 405000
//         };

//         if (!prices[chosen]) return bot.sendMessage(chatId, "❌ Noto‘g‘ri paket.");

//         userStates[chatId] = { step: 'choosing_recipient', selectedPackage: chosen, price: prices[chosen] };
//         return bot.sendMessage(chatId, `Premium: ${chosen}\nNarxi: ${prices[chosen]} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
//             reply_markup: {
//                 keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'choosing_recipient') {
//         let recipient = text.trim();
//         if (recipient === "🙋‍♂️ O‘zimga") {
//             recipient = `@${msg.from.username || "nomalum"}`;
//         } else if (!recipient.startsWith('@')) {
//             recipient = `@${recipient}`;
//         }

//         const { selectedPackage, price } = userStates[chatId];
//         delete userStates[chatId];

//         await bot.sendMessage(ADMIN_CHAT_ID, `🚕 PREMIUM BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n🎓 Paket: ${selectedPackage}\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

//         return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\nPaket: ${selectedPackage}\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
//             reply_markup: {
//                 inline_keyboard: [
//                     [
//                         { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
//                         { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
//                     ],
//                     [
//                         { text: "🔙 Ortga", callback_data: "back_to_main" },
//                         { text: "❌ Bekor qilish", callback_data: "cancel_order" }
//                     ]
//                 ]
//             }
//         });
//     }

//     if (text === "🚘 Support") {
//         return bot.sendMessage(chatId, `📞 Admin bilan bog‘lanish uchun quyidagi tugmani bosing:`, {
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: "👨‍💻 Admin bilan bog‘lanish", url: `https://t.me/${SUPPORT_USERNAME}` }
//                 ]]
//             }
//         });
//     }
// });















// require('dotenv').config();
// const TelegramBot = require('node-telegram-bot-api');
// const mongoose = require('mongoose');
// const connectDB = require('./db/db');
// const User = require('./models/User');

// connectDB();

// const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
// const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
// const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// const userSteps = {}; // Telefon bosqichi uchun
// const userStates = {}; // Har bir foydalanuvchi uchun state
// const referralMap = {}; // /start?ref=id uchun

// // /start komandasi
// bot.onText(/\/start(?:\?ref=(\d+))?/, async (msg, match) => {
//     const chatId = msg.chat.id;
//     const userId = msg.from.id;
//     const referrerId = match[1];

//     const existingUser = await User.findOne({ telegramId: userId });

//     if (existingUser) {
//         return sendMainMenu(chatId);
//     }

//     if (referrerId) {
//         referralMap[userId] = referrerId;
//         await bot.sendMessage(referrerId, "🆕 Sizda yangi taklif mavjud!");
//     }

//     userSteps[chatId] = { step: 'waiting_for_phone' };

//     const keyboard = {
//         keyboard: [[{ text: "📞 Telefon raqamni yuborish", request_contact: true }]],
//         resize_keyboard: true,
//         one_time_keyboard: true,
//     };

//     await bot.sendMessage(chatId, "📲 Telefon raqamingizni yuboring (faqat +998).", {
//         reply_markup: keyboard
//     });
// });

// bot.on('contact', async (msg) => {
//     const chatId = msg.chat.id;
//     const userId = msg.contact.user_id;

//     if (userSteps[chatId]?.step !== 'waiting_for_phone') return;

//     const phone = msg.contact.phone_number;
//     if (!phone.startsWith('+998')) {
//         return bot.sendMessage(chatId, "❌ Faqat +998 bilan boshlanuvchi O‘zbekiston raqamlari qabul qilinadi.");
//     }

//     const status = await checkChannelMembership(userId);
//     if (!['member', 'creator', 'administrator'].includes(status)) {
//         return bot.sendMessage(chatId, `❗️Avval ${REQUIRED_CHANNEL} kanaliga a’zo bo‘ling!`, {
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: "🔗 Kanalga o'tish", url: `https://t.me/${REQUIRED_CHANNEL.replace('@', '')}` },
//                     { text: "✅ A'zo bo‘ldim", callback_data: "check_subscription" }
//                 ]]
//             }
//         });
//     }

//     const newUser = await User.create({
//         telegramId: userId,
//         phoneNumber: phone,
//         username: msg.from.username || '',
//         firstName: msg.from.first_name || '',
//         referralBy: referralMap[userId] || null,
//         starsEarned: 0
//     });

//     if (referralMap[userId]) {
//         const refUser = await User.findOne({ telegramId: referralMap[userId] });
//         if (refUser) {
//             refUser.starsEarned = (refUser.starsEarned || 0) + 1;
//             await refUser.save();
//             await bot.sendMessage(refUser.telegramId, `✅ Sizga 1 ta ⭐ qo‘shildi! Jami: ${refUser.starsEarned} ⭐`);
//         }
//     }

//     delete userSteps[chatId];
//     delete referralMap[userId];
//     await sendMainMenu(chatId);
// });

// bot.on("callback_query", async (query) => {
//     const chatId = query.message.chat.id;
//     const userId = query.from.id;

//     if (query.data === "check_subscription") {
//         const status = await checkChannelMembership(userId);
//         if (["member", "creator", "administrator"].includes(status)) {
//             await bot.answerCallbackQuery(query.id, { text: "✅ Tasdiqlandi!" });
//             return sendMainMenu(chatId);
//         } else {
//             await bot.answerCallbackQuery(query.id, { text: "❌ Siz hali a’zo emassiz." });
//         }
//     }

//     if (query.data === "back_to_main" || query.data === "cancel_order") {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }
// });

// function sendMainMenu(chatId) {
//     return bot.sendMessage(chatId, "✅ Endi xizmat turini tanlang:", {
//         reply_markup: {
//             keyboard: [
//                 ["⭐ Premium sotib olish", "💎 Stars sotib olish"],
//                 ["👥 Stars ishlash", "🚘 Support"]
//             ],
//             resize_keyboard: true
//         }
//     });
// }

// async function checkChannelMembership(userId) {
//     try {
//         const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
//         return res.status;
//     } catch (err) {
//         console.error("Kanal tekshirishda xatolik:", err.message);
//         return 'left';
//     }
// }

// bot.on('message', async (msg) => {
//     const chatId = msg.chat.id;
//     const text = msg.text?.trim();
//     if (!text) return;

//     if (text === "🔙 Ortga" || text === "❌ Bekor qilish") {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_recipient' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     if (userStates[chatId]?.step === 'choosing_recipient' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_amount' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     if (userStates[chatId]?.step === 'choosing_package' && (text === "🔙 Ortga" || text === "❌ Bekor qilish")) {
//         delete userStates[chatId];
//         return sendMainMenu(chatId);
//     }

//     if (text === "👥 Stars ishlash") {
//         return bot.sendMessage(chatId, `👥 Do‘stlaringizni taklif qilib yutib oling!

//         Sizning referal havolangiz:
//         https://t.me/${process.env.BOT_USERNAME}?start=ref${chatId}
        
//         Har bir do‘st telefon raqamini yuborsa sizga 1 ⭐ beriladi. 50⭐ dan keyin almashtirish mumkin!`);
//     }

//     if (text === "💎 Stars sotib olish") {
//         userStates[chatId] = { step: 'waiting_for_star_amount' };
//         return bot.sendMessage(chatId, "Yozing nechta star kerak? (Minimal 50 ta, maksimal 5000 ta)");
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_amount') {
//         const count = parseInt(text);
//         if (isNaN(count) || count < 50 || count > 5000) {
//             return bot.sendMessage(chatId, "❌ Stars miqdori 50-5000 oralig'ida bo'lishi kerak.");
//         }

//         const price = count * 240;
//         userStates[chatId] = {
//             step: 'waiting_for_star_recipient',
//             starAmount: count,
//             price
//         };

//         return bot.sendMessage(chatId, `⭐ ${count} ta star narxi: ${price} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
//             reply_markup: {
//                 keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'waiting_for_star_recipient') {
//         let recipient = text.trim();
//         if (recipient === "🙋‍♂️ O‘zimga") {
//             recipient = `@${msg.from.username || "nomalum"}`;
//         } else if (!recipient.startsWith('@')) {
//             recipient = `@${recipient}`;
//         }

//         const { starAmount, price } = userStates[chatId];
//         delete userStates[chatId];

//         await bot.sendMessage(ADMIN_CHAT_ID, `💎 STARS BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n⭐ Miqdor: ${starAmount} ta\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

//         return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\n⭐ ${starAmount} ta star\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
//             reply_markup: {
//                 inline_keyboard: [
//                     [
//                         { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
//                         { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
//                     ],
//                     [
//                         { text: "🔙 Ortga", callback_data: "back_to_main" },
//                         { text: "❌ Bekor qilish", callback_data: "cancel_order" }
//                     ]
//                 ]
//             }
//         });
//     }

//     if (text === "⭐ Premium sotib olish") {
//         userStates[chatId] = { step: 'choosing_package' };

//         return bot.sendMessage(chatId, `⚠️ <b>PREMIUM NARXLARI 🧙</b>\n\n🎁3 oylik - 175.000 so’m\n🎁6 oylik - 240.000 so’m\n🎁12 oylik - 405.000 so’m`, {
//             parse_mode: "HTML",
//             reply_markup: {
//                 keyboard: [
//                     ["📦 3 oy", "📦 6 oy"],
//                     ["📦 1 yil", "🔙 Ortga"]
//                 ],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'choosing_package' && text.startsWith("📦")) {
//         const chosen = text.replace("📦 ", "").trim();
//         const prices = {
//             "3 oy": 170000,
//             "6 oy": 240000,
//             "1 yil": 405000
//         };

//         if (!prices[chosen]) return bot.sendMessage(chatId, "❌ Noto‘g‘ri paket.");

//         userStates[chatId] = {
//             step: 'choosing_recipient',
//             selectedPackage: chosen,
//             price: prices[chosen]
//         };

//         return bot.sendMessage(chatId, `Premium: ${chosen}\nNarxi: ${prices[chosen]} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O‘zimga' ni tanlang:`, {
//             reply_markup: {
//                 keyboard: [["🙋‍♂️ O‘zimga", "🔙 Ortga"]],
//                 resize_keyboard: true
//             }
//         });
//     }

//     if (userStates[chatId]?.step === 'choosing_recipient') {
//         let recipient = text.trim();
//         if (recipient === "🙋‍♂️ O‘zimga") {
//             recipient = `@${msg.from.username || "nomalum"}`;
//         } else if (!recipient.startsWith('@')) {
//             recipient = `@${recipient}`;
//         }

//         const { selectedPackage, price } = userStates[chatId];
//         delete userStates[chatId];

//         await bot.sendMessage(ADMIN_CHAT_ID, `🚕 PREMIUM BUYURTMA\n\n👤 Kimdan: @${msg.from.username || "nomalum"}\n🎓 Paket: ${selectedPackage}\n💵 Narxi: ${price} so'm\n👥 Kimga: ${recipient}`);

//         return bot.sendMessage(chatId, `✅ Buyurtma tayyor!\n\nPaket: ${selectedPackage}\nNarxi: ${price} so'm\nKimga: ${recipient}`, {
//             reply_markup: {
//                 inline_keyboard: [
//                     [
//                         { text: "💳 Click orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" },
//                         { text: "💳 Paynet orqali to'lash", url: "https://t.me/m/8YE5e4r-MzAy" }
//                     ],
//                     [
//                         { text: "🔙 Ortga", callback_data: "back_to_main" },
//                         { text: "❌ Bekor qilish", callback_data: "cancel_order" }
//                     ]
//                 ]
//             }
//         });
//     }

//     if (text === "🚘 Support") {
//         return bot.sendMessage(chatId, `📞 Admin bilan bog‘lanish uchun quyidagi tugmani bosing:`, {
//             reply_markup: {
//                 inline_keyboard: [[
//                     { text: "👨‍💻 Admin bilan bog‘lanish", url: `https://t.me/${process.env.SUPPORT_USERNAME}` }
//                 ]]
//             }
//         });
//     }
// });

