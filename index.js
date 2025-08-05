require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const connectDB = require("./db/db");
const paynetRouter = require("./router");
const User = require("./models/User");
const Price = require("./models/Price");
const Payment = require("./models/Payments");
const Counter = require("./models/Counter");
const cors = require("cors");

connectDB();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL;
const ADMIN_CHAT_ID = Number(process.env.ADMIN_CHAT_ID);
const BOT_USERNAME = process.env.BOT_USERNAME;
const SUPPORT_USERNAME = process.env.SUPPORT_USERNAME;

const userSteps = {}; // Track user interaction steps
const userStates = {}; // Track user state
const referralMap = {}; // Track referral links

// === Generate unique order_id ===
async function generateOrderId() {
  try {
    const counter = await Counter.findOneAndUpdate(
      { name: "order_id" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );
    return String(counter.seq).padStart(5, "0"); // Ensures 00001, 00002, etc.
  } catch (error) {
    console.error("Order ID generation error:", error);
    // Fallback: Generate a random 5-digit ID and ensure uniqueness
    let tempSeq;
    let orderId;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      tempSeq = Math.floor(Math.random() * 100000); // Random number up to 99999
      orderId = String(tempSeq).padStart(5, "0");
      const existingPayment = await Payment.findOne({ order_id: orderId });
      if (!existingPayment) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error(
        "Failed to generate a unique order_id after multiple attempts"
      );
    }

    return orderId;
  }
}

// === Check channel membership ===
async function checkChannelMembership(userId) {
  try {
    const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
    return res.status;
  } catch (err) {
    console.error("Channel membership check error:", err.message);
    return "left";
  }
}

// === Normalize phone number ===
function normalizePhoneNumber(phone) {
  // Remove spaces, dashes, and other characters
  phone = phone.replace(/[\s\-\(\)]/g, "");

  // Add +998 prefix if missing
  if (!phone.startsWith("+998")) {
    if (phone.startsWith("998")) {
      phone = `+${phone}`;
    } else if (phone.startsWith("8") && phone.length === 9) {
      phone = `+998${phone}`;
    } else {
      return null; // Invalid format
    }
  }

  // Validate format: +998XXXXXXXXX (12 digits total)
  if (!/^\+998\d{9}$/.test(phone)) {
    return null;
  }

  return phone;
}

// === Fetch prices from database ===
async function getPrices() {
  try {
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
  } catch (error) {
    console.error("Error fetching prices:", error);
    return {
      "3 oy": 175000,
      "6 oy": 240000,
      "1 yil": 405000,
      star_per_unit: 240,
    };
  }
}

// === Main menu function ===
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

// === Admin panel function ===
function sendAdminPanel(chatId) {
  return bot.sendMessage(chatId, "🛠 Admin paneliga xush kelibsiz", {
    reply_markup: {
      keyboard: [
        ["📋 Barcha foydalanuvchilar"],
        ["🔍 Foydalanuvchini ID bo'yicha topish"],
        ["💰 To'lovlar tarixi"],
        ["💵 Narxlarni o'zgartirish"],
      ],
      resize_keyboard: true,
    },
  });
}

// === Clear user state ===
function clearUserState(chatId) {
  delete userSteps[chatId];
  delete userStates[chatId];
}

// === /start command with optional referral ===
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const param = match[1];

  try {
    // Admin check
    if (userId === ADMIN_CHAT_ID) {
      return sendAdminPanel(chatId);
    }

    const existingUser = await User.findOne({ telegramId: userId });
    if (existingUser) {
      return sendMainMenu(chatId);
    }

    // Handle referral parameter
    if (param && param.startsWith("ref")) {
      const referrerId = param.replace("ref", "");
      if (referrerId && !isNaN(referrerId)) {
        referralMap[userId] = Number(referrerId);
        try {
          await bot.sendMessage(referrerId, "🆕 Sizda yangi taklif mavjud!");
        } catch (error) {
          console.error("Error sending referral notification:", error);
        }
      }
    }

    userSteps[chatId] = { step: "waiting_for_phone" };
    const keyboard = {
      keyboard: [
        [{ text: "📞 Telefon raqamni yuborish", request_contact: true }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    };

    await bot.sendMessage(
      chatId,
      "📲 Telefon raqamingizni yuboring (faqat +998 bilan boshlanuvchi O'zbekiston raqamlari).",
      { reply_markup: keyboard }
    );
  } catch (error) {
    console.error("Error in /start command:", error);
    await bot.sendMessage(
      chatId,
      "❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
});

// === Handle contact (phone number) submission ===
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.contact.user_id;

  try {
    if (userSteps[chatId]?.step !== "waiting_for_phone") {
      return;
    }

    const normalizedPhone = normalizePhoneNumber(msg.contact.phone_number);
    if (!normalizedPhone) {
      return bot.sendMessage(
        chatId,
        "❌ Faqat +998 bilan boshlanuvchi O'zbekiston raqamlari qabul qilinadi."
      );
    }

    const status = await checkChannelMembership(userId);
    if (!["member", "creator", "administrator"].includes(status)) {
      return bot.sendMessage(
        chatId,
        `❗️Avval ${REQUIRED_CHANNEL} kanaliga a'zo bo'ling!`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔗 Kanalga o'tish",
                  url: `https://t.me/${REQUIRED_CHANNEL.replace("@", "")}`,
                },
                {
                  text: "✅ A'zo bo'ldim",
                  callback_data: "check_subscription",
                },
              ],
            ],
          },
        }
      );
    }

    await User.create({
      telegramId: userId,
      phoneNumber: normalizedPhone,
      username: msg.from.username || "",
      firstName: msg.from.first_name || "",
      referralBy: referralMap[userId] || null,
      starsEarned: 0,
    });

    // Handle referral bonus
    if (referralMap[userId]) {
      try {
        const refUser = await User.findOne({ telegramId: referralMap[userId] });
        if (refUser) {
          refUser.starsEarned = (refUser.starsEarned || 0) + 1;
          await refUser.save();
          await bot.sendMessage(
            refUser.telegramId,
            `✅ Sizga 1 ta ⭐ qo'shildi! Jami: ${refUser.starsEarned} ⭐`
          );
        }
      } catch (error) {
        console.error("Error processing referral bonus:", error);
      }
    }

    clearUserState(chatId);
    delete referralMap[userId];
    await sendMainMenu(chatId);
  } catch (error) {
    console.error("Error processing contact:", error);
    await bot.sendMessage(
      chatId,
      "❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
});

// === Handle callback queries ===
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  try {
    if (data === "check_subscription") {
      const status = await checkChannelMembership(userId);
      if (["member", "creator", "administrator"].includes(status)) {
        await bot.answerCallbackQuery(query.id, { text: "✅ Tasdiqlandi!" });
        return sendMainMenu(chatId);
      } else {
        await bot.answerCallbackQuery(query.id, {
          text: "❌ Siz hali a'zo emassiz.",
        });
      }
    }

    if (data === "back_to_main") {
      clearUserState(chatId);
      return userId === ADMIN_CHAT_ID
        ? sendAdminPanel(chatId)
        : sendMainMenu(chatId);
    }
  } catch (error) {
    console.error("Error handling callback query:", error);
    await bot.answerCallbackQuery(query.id, { text: "❌ Xatolik yuz berdi." });
  }
});

// === Handle text messages ===
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text?.trim();

  if (!text || msg.contact) return; // Skip if no text or it's a contact

  try {
    // Unified back handling
    if (text === "🔙 Ortga") {
      clearUserState(chatId);
      return userId === ADMIN_CHAT_ID
        ? sendAdminPanel(chatId)
        : sendMainMenu(chatId);
    }

    // === ADMIN COMMANDS ===
    if (userId === ADMIN_CHAT_ID) {
      await handleAdminCommands(chatId, text, userStates);
      return;
    }

    // === USER COMMANDS ===
    await handleUserCommands(chatId, userId, text, msg, userStates);
  } catch (error) {
    console.error("Error handling message:", error);
    await bot.sendMessage(
      chatId,
      "❌ Xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring."
    );
  }
});

// === Handle Admin Commands ===
async function handleAdminCommands(chatId, text, userStates) {
  if (text === "📋 Barcha foydalanuvchilar") {
    const users = await User.find().limit(50);
    const formatted = users
      .map(
        (u) =>
          `👤 ${u.firstName} | @${u.username || "-"} | ID: ${
            u.telegramId
          } | ⭐ ${u.starsEarned}`
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

  if (text === "🔍 Foydalanuvchini ID bo'yicha topish") {
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
    const targetId = Number(text);
    if (isNaN(targetId)) {
      return bot.sendMessage(chatId, "❌ Iltimos, to'g'ri raqam kiriting.", {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      });
    }

    const target = await User.findOne({ telegramId: targetId });
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
        "❌ Iltimos, 0 dan katta to'g'ri raqam kiriting (masalan, 10).",
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
      `✅ ${amount} ta yulduz qo'shildi. Yangi balans: ${user.starsEarned} ⭐`,
      {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      }
    );

    try {
      await bot.sendMessage(
        targetId,
        `🎁 Sizga ${amount} ta yulduz qo'shildi! Yangi balans: ${user.starsEarned} ⭐`
      );
    } catch (error) {
      console.error("Error notifying user about stars:", error);
    }

    delete userStates[chatId];
    return sendAdminPanel(chatId);
  }

  if (text === "💰 To'lovlar tarixi") {
    return bot.sendMessage(
      chatId,
      "💳 Hozircha to'lovlar tarixi bo'limi ishlab chiqilmoqda.",
      {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      }
    );
  }

  if (text === "💵 Narxlarni o'zgartirish") {
    const prices = await getPrices();
    userStates[chatId] = { step: "select_price_type" };
    return bot.sendMessage(
      chatId,
      `📋 Joriy narxlar:\n\n` +
        `Premium 3 oy: ${prices["3 oy"]} so'm\n` +
        `Premium 6 oy: ${prices["6 oy"]} so'm\n` +
        `Premium 1 yil: ${prices["1 yil"]} so'm\n` +
        `1 ta yulduz: ${prices.star_per_unit} so'm\n\n` +
        `O'zgartirmoqchi bo'lgan narx turini tanlang:`,
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
        "❌ Noto'g'ri tanlov. Iltimos, ro'yxatdan tanlang.",
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
      `Yangi narxni so'mda kiriting (masalan, 175000):`,
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
        "❌ Iltimos, 0 dan katta to'g'ri raqam kiriting (masalan, 175000).",
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
      `✅ ${priceTypeDisplay[priceType]} narxi ${newPrice} so'mga o'zgartirildi.`,
      {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      }
    );
    delete userStates[chatId];
    return sendAdminPanel(chatId);
  }
}

// === Handle User Commands ===
async function handleUserCommands(chatId, userId, text, msg, userStates) {
  // Stars earning (referral link)
  if (text === "👥 Stars ishlash") {
    const user = await User.findOne({ telegramId: userId });
    const starsCount = user?.starsEarned || 0;
    return bot.sendMessage(
      chatId,
      `👥 Do'stlaringizni taklif qilib yutib oling!\n\n` +
        `💰 Sizning balansingiz: ${starsCount} ⭐\n\n` +
        `Sizning referal havolangiz:\nhttps://t.me/${BOT_USERNAME}?start=ref${userId}\n\n` +
        `Har bir do'st telefon raqamini yuborsa sizga 1 ⭐ beriladi. 50⭐ dan keyin almashtirish mumkin!`,
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
      `⭐ ${count} ta star narxi: ${price} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O'zimga' ni tanlang:`,
      {
        reply_markup: {
          keyboard: [["🙋‍♂️ O'zimga", "🔙 Ortga"]],
          resize_keyboard: true,
        },
      }
    );
  }

  if (userStates[chatId]?.step === "waiting_for_star_recipient") {
    let recipient = text.trim();
    if (recipient === "🙋‍♂️ O'zimga") {
      recipient = `@${msg.from.username || "nomalum"}`;
    } else if (!recipient.startsWith("@")) {
      recipient = `@${recipient}`;
    }

    const { starAmount, price } = userStates[chatId];
    delete userStates[chatId];

    const orderId = await generateOrderId();
    const user = await User.findOne({ telegramId: userId });

    // Save to Payment collection
    try {
      const payment = await Payment.create({
        user: user?._id,
        amount: price,
        type: "star_purchase",
        starsCount: starAmount,
        months: null,
        transactionId: null,
        status: false, // Pending confirmation
        order_id: orderId,
      });

      console.log(`Payment saved: ${payment._id}`);
    } catch (error) {
      console.error("Error saving payment:", error);
      await bot.sendMessage(chatId, "❌ To'lovni saqlashda xatolik yuz berdi.");
      return;
    }

    try {
      await bot.sendMessage(
        ADMIN_CHAT_ID,
        `💎 STARS BUYURTMA\n\n` +
          `👤 Kimdan: @${msg.from.username || "nomalum"}\n` +
          `⭐ Miqdor: ${starAmount} ta\n` +
          `💵 Narxi: ${price} so'm\n` +
          `👥 Kimga: ${recipient}\n` +
          `🆔 Buyurtma: ${orderId}`
      );
    } catch (error) {
      console.error("Error sending order to admin:", error);
    }

    return bot.sendMessage(
      chatId,
      `✅ Buyurtma tayyor!\n\n⭐ ${starAmount} ta star\nNarxi: ${price} so'm\nKimga: ${recipient}\n�ID Buyurtma: ${orderId}`,
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
        `🎁3 oylik - ${prices["3 oy"]} so'm\n` +
        `🎁6 oylik - ${prices["6 oy"]} so'm\n` +
        `🎁12 oylik - ${prices["1 yil"]} so'm`,
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

  if (
    userStates[chatId]?.step === "choosing_package" &&
    text.startsWith("📦")
  ) {
    const chosen = text.replace("📦 ", "").trim();
    const prices = await getPrices();

    if (!prices[chosen]) {
      return bot.sendMessage(chatId, "❌ Noto'g'ri paket.", {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      });
    }

    userStates[chatId] = {
      step: "choosing_recipient",
      selectedPackage: chosen,
      price: prices[chosen],
    };
    return bot.sendMessage(
      chatId,
      `Premium: ${chosen}\nNarxi: ${prices[chosen]} so'm\n\nKimga yuboramiz? @username kiriting yoki 'O'zimga' ni tanlang:`,
      {
        reply_markup: {
          keyboard: [["🙋‍♂️ O'zimga", "🔙 Ortga"]],
          resize_keyboard: true,
        },
      }
    );
  }

  if (userStates[chatId]?.step === "choosing_recipient") {
    let recipient = text.trim();
    if (recipient === "🙋‍♂️ O'zimga") {
      recipient = `@${msg.from.username || "nomalum"}`;
    } else if (!recipient.startsWith("@")) {
      recipient = `@${recipient}`;
    }

    const { selectedPackage, price } = userStates[chatId];
    delete userStates[chatId];

    const orderId = await generateOrderId();
    const user = await User.findOne({ telegramId: userId });

    // Determine months based on selected package
    const monthsMap = {
      "3 oy": 3,
      "6 oy": 6,
      "1 yil": 12,
    };
    const months = monthsMap[selectedPackage] || null;

    // Save to Payment collection
    try {
      const payment = await Payment.create({
        user: user._id,
        amount: price,
        type: "premium_purchase",
        starsCount: null,
        months: months,
        transactionId: null,
        status: false, // Pending confirmation
        order_id: orderId,
      });

      console.log(`Payment saved: ${payment._id}`);
    } catch (error) {
      console.error("Error saving payment:", error);
      await bot.sendMessage(chatId, "❌ To'lovni saqlashda xatolik yuz berdi.");
      return;
    }

    try {
      await bot.sendMessage(
        ADMIN_CHAT_ID,
        `🚕 PREMIUM BUYURTMA\n\n` +
          `👤 Kimdan: @${msg.from.username || "nomalum"}\n` +
          `🎓 Paket: ${selectedPackage}\n` +
          `💵 Narxi: ${price} so'm\n` +
          `👥 Kimga: ${recipient}\n` +
          `🆔 Buyurtma: ${orderId}`
      );
    } catch (error) {
      console.error("Error sending order to admin:", error);
    }

    return bot.sendMessage(
      chatId,
      `✅ Buyurtma tayyor!\n\nPaket: ${selectedPackage}\nNarxi: ${price} so'm\nKimga: ${recipient}\n�ID Buyurtma: ${orderId}`,
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
      `📞 Admin bilan bog'lanish uchun quyidagi tugmani bosing:`,
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
}

// Invalid phone number format handler
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (
    userSteps[chatId]?.step === "waiting_for_manual_phone" &&
    text &&
    !/^\+998\d{9}$/.test(text)
  ) {
    return bot.sendMessage(
      chatId,
      "❌ Noto‘g‘ri format. Iltimos, telefon raqamingizni +998 bilan boshlanadigan va 12 raqamdan iborat holda kiriting (masalan, +998901234567).",
      {
        reply_markup: { keyboard: [["🔙 Ortga"]], resize_keyboard: true },
      }
    );
  }
});

// Express server setup
const app = express();
app.use(express.json());
app.use(cors());
app.use("/api", paynetRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server ${PORT}-portda ishga tushdi`);
  bot.setWebHook(
    `${process.env.RENDER_PUBLIC_URL}/bot${process.env.BOT_TOKEN}`
  );
});

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
