const express = require("express");
const router = express.Router();
const dayjs = require("dayjs");
const USER_DB = require("./models/User");
const Payment = require("./models/Payments");

router.post("/paynet", async (req, res) => {
  const { id, method, params } = req.body;

  try {
    if (!method) {
      return res.json({
        jsonrpc: "2.0",
        id: id || null,
        error: { code: -32600, message: "Method ko‘rsatilmagan" },
      });
    }

    switch (method) {
      case "GetInformation": {
        if (!params?.fields?.username) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Majburiy parametrlar yo‘q" },
          });
        }

        let username = params.fields.username.replace("@", "");
        const user = await USER_DB.findOne({ username });

        if (!user) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: 302, message: "Foydalanuvchi topilmadi" },
          });
        }

        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            status: "0",
            timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
            fields: {
              username: user.username,
              firstName: user.firstName,
              phoneNumber: user.phoneNumber,
            },
          },
        });
      }

      case "PerformTransaction": {
        if (!params?.fields?.username) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Majburiy parametrlar yo‘q" },
          });
        }

        const exactUser = await USER_DB.findOne({
          username: params.fields.username,
        });
        if (!exactUser) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: 302, message: "Foydalanuvchi topilmadi" },
          });
        }

        const data = {
          user: exactUser._id,
          amount: params.amount,
          type: params.fields.type,
          transactionId: params.transactionId,
          starsCount: params.fields.starsCount,
          months: params.fields.months,
        };

        const existing = await Payment.findOne({
          transactionId: data.transactionId,
        });
        if (existing) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: 201, message: "Bunday to‘lov mavjud" },
          });
        }

        const payment = await Payment.create(data);
        if (!payment) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: 302, message: "To‘lov qilishda xatolik" },
          });
        }

        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
            providerTrnId: payment._id,
            fields: {
              username: params.fields.username,
              firstName: exactUser.firstName,
              type: params.fields.type === "stars" ? "Stars" : "Premium",
            },
          },
        });
      }

      case "CheckTransaction": {
        const transaction = await Payment.findOne({
          transactionId: params.transactionId,
        });

        if (!transaction) {
          return res.json({
            jsonrpc: "2.0",
            id,
            error: { code: 203, message: "Transakziya topilmadi" },
          });
        }

        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            transactionState: transaction.status ? 1 : 2,
            timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
            providerTrnId: transaction._id,
          },
        });
      }

      case "GetStatement": {
        const { dateFrom, dateTo } = params;
        const transactions = await Payment.find({
          status: true,
          createdAt: {
            $gte: new Date(dateFrom),
            $lte: new Date(dateTo),
          },
        });

        return res.json({
          jsonrpc: "2.0",
          id,
          result: {
            statements: transactions.map((item) => ({
              transactionId: item.transactionId,
              amount: item.amount,
              providerTrnId: item._id,
              timestamp: dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss"),
            })),
          },
        });
      }

      default:
        return res.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "So‘ralgan metod topilmadi" },
        });
    }
  } catch (err) {
    console.error(err);
    return res.json({
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32603, message: "Tizim xatosi" },
    });
  }
});

module.exports = router;
