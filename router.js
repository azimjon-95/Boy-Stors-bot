const express = require("express");
const router = express.Router();
// const basicAuth = require("basic-auth");
const USER_DB = require("./models/User");
const Payment = require("./models/Payments");
const dayjs = require("dayjs");

// // In-memory transaction storage
// const transactions = new Map();
// let providerTransactionCounter = 1000;

// // Auth config
// const AUTH_USER = process.env.PAYNET_USER || "uzpaynet";
// const AUTH_PASS = process.env.PAYNET_PASS || "secret";

// // Auth middleware
// router.use((req, res, next) => {
//   const user = basicAuth(req);
//   if (!user || user.name !== AUTH_USER || user.pass !== AUTH_PASS) {
//     return res.status(401).json({
//       jsonrpc: "2.0",
//       id: null,
//       error: { code: 401, message: "Unauthorized" },
//     });
//   }
//   next();
// });

// POST /api/paynet/getInformation

router.get("/all", async (req, res) => {
  try {
    const users = await USER_DB.find();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Serverda xatolik yuz berdi" });
  }
});

router.post("/getInformation", async (req, res) => {
  try {
    const { id, jsonrpc, method, params } = req.body;

    if (req.method !== "POST") {
      return res.json({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32300, message: "So‘rov POST metodi orqali kelmagan" },
      });
    }
    if (jsonrpc !== "2.0") {
      return res.json({
        jsonrpc: "2.0",
        id: id || null,
        error: { code: -32700, message: "JSONni tahlil qilishda xatolik" },
      });
    }
    if (method !== "GetInformation") {
      return res.json({
        jsonrpc: "2.0",
        id: id || null,
        error: { code: -32601, message: "So‘ralgan metod topilmadi" },
      });
    }
    if (!params || !params.fields || !params.fields.username) {
      return res.json({
        jsonrpc: "2.0",
        id: id || null,
        error: { code: -32602, message: "Majburiy parametrlar yo‘q" },
      });
    }

    let username = params.fields.username;
    username = username.replace("@", "");

    const user = await USER_DB.findOne({ username });
    if (!user) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: 302,
          message: "Foydalanuvchi topilmadi",
        },
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
  } catch (err) {
    console.error(err);
    return res.json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Tizim xatosi",
      },
    });
  }
});

// perform transactions
router.post("/performTransaction", async (req, res) => {
  try {
    const { id, params } = req.body;

    let exactUSer = await USER_DB.findOne({ username: params.fields.username });

    if (!exactUSer) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: 302,
          message: "Foydalanuvchi topilmadi",
        },
      });
    }

    let data = {
      user: exactUSer._id,
      amount: params.amount,
      type: params.fields.type,
      transactionId: params.transactionId,
    };

    let findPayment = await Payment.findOne({
      transactionId: data.transactionId,
    });

    if (findPayment) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: 302,
          message: "Bunday to‘lov mavjud",
        },
      });
    }

    let payment = await Payment.create(data);

    if (!payment) {
      return res.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: 302,
          message: "To‘lov qilishda xatolik",
        },
      });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        providerTrnId: payment?._id,
        fields: {
          username: params.fields.username,
          firstName: exactUSer.firstName,
          type: params.fields.type === "stars" ? "Stars" : "Premium",
          amount: params.amount,
          message: "To‘lov muvaffaqiyatli amalga oshirildi",
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Tizim xatosi",
      },
    });
  }
});

// check transaction
router.post("/checkTransaction", async (req, res) => {
  try {
    const { id, params } = req.body;
    let transaction = await Payment.findOne({
      transactionId: params.transactionId,
      // status: true,
    });
    if (!transaction) {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          transactionState: 3,
          timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
          // providerTrnId: transaction._id,
        },
      });
    }

    if (!transaction.status) {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          transactionState: 2,
          timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
          providerTrnId: transaction._id,
        },
      });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        transactionState: 1,
        timestamp: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        providerTrnId: transaction._id,
      },
    });
  } catch (err) {
    console.error(err);
    return res.json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Tizim xatosi",
      },
    });
  }
});

// get statement
router.post("/getStatement", async (req, res) => {
  try {
    const { id, params } = req.body;
    let { dateFrom, dateTo } = params;
    let transaction = await Payment.find({
      status: true,
      createdAt: {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo),
      },
    });
    //  "2021-04-23 17:04:22";
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        statements: transaction.map((item) => {
          return {
            transactionId: item.transactionId,
            amount: item.amount,
            providerTrnId: item._id,  
            timestamp: dayjs(item.createdAt).format("YYYY-MM-DD HH:mm:ss"),
          };
        }),
      },
    });
  } catch (err) {
    console.error(err);
    return res.json({
      jsonrpc: "2.0",
      id: req.body?.id || null,
      error: {
        code: -32603,
        message: "Tizim xatosi",
      },
    });
  }
});

module.exports = router;
