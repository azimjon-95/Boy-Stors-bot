### Loyiha haqida
Ushbu loyiha Telegram platformasida ishlovchi bot bo‘lib, foydalanuvchilarga premium xizmatlar va "stars" (yulduzlar) sotib olish, shuningdek, referral tizimi orqali yulduzlar ishlash imkoniyatini taqdim etadi. Bot MongoDB ma’lumotlar bazasi bilan integratsiyalangan bo‘lib, foydalanuvchi ma’lumotlarini saqlash, kanal a’zoligini tekshirish va buyurtmalarni boshqarish kabi funksiyalarni qo‘llab-quvvatlaydi.

#### Asosiy funksiyalar:
- **Ro‘yxatdan o‘tish**: Foydalanuvchilar +998 bilan boshlanadigan telefon raqami orqali ro‘yxatdan o‘tadi.
- **Kanal a’zoligini tekshirish**: Botdan foydalanish uchun foydalanuvchilar belgilangan Telegram kanaliga a’zo bo‘lishi shart.
- **Referral tizimi**: Do‘stlarini taklif qilgan foydalanuvchilar har bir yangi a’zo uchun 1 yulduz oladi.
- **Premium xizmatlar**: 3 oy, 6 oy yoki 1 yillik premium paketlarni sotib olish imkoniyati.
- **Stars sotib olish**: 50 dan 5000 gacha yulduz sotib olish mumkin.
- **Admin boshqaruvi**: Buyurtmalar adminlarga yuboriladi, to‘lovlar Click yoki Paynet orqali amalga oshiriladi.
- **Qo‘llab-quvvatlash**: Foydalanuvchilar admin bilan bog‘lanish imkoniga ega.

### Loyihani ishga tushirish
1. **Talablar**:
   - Node.js (v14 yoki undan yuqori)
   - MongoDB (ma’lumotlar bazasi)
   - Telegram Bot Token (BotFather orqali olish mumkin)
   - `.env` faylida quyidagi o‘zgaruvchilar sozlanishi kerak:
BOT_TOKEN=your_bot_token
BOT_USERNAME=@your_bot_username
REQUIRED_CHANNEL=@your_channel
ADMIN_CHAT_ID=your_admin_chat_id
SUPPORT_USERNAME=@your_support_username
MONGODB_URI=your_mongodb_connection_string

text

Свернуть

Перенос

Копировать
2. **O‘rnatish**:
```bash
git clone <repository_url>
cd <project_folder>
npm install
.env faylini sozlash: Loyiha ildizida .env faylini yarating va yuqoridagi o‘zgaruvchilarni to‘ldiring.
Loyihani ishga tushirish:
bash

Свернуть

Перенос

Исполнить

Копировать
npm start
MongoDB ulanishi: MongoDB ma’lumotlar bazasi ulanganligiga ishonch hosil qiling. Ulanish sozlamalari db/db.js faylida joylashgan.
Loyiha tuzilishi
index.js: Botning asosiy fayli, barcha asosiy logika shu yerda.
db/db.js: MongoDB bilan ulanish uchun konfiguratsiya fayli.
models/User.js: Foydalanuvchi ma’lumotlari uchun Mongoose modeli.
.env: Maxfiy ma’lumotlar (tokenlar, kanal ID va boshqalar) saqlanadi.
.gitignore: Versiya nazoratiga kiritilmaydigan fayllar ro‘yxati.
Foydalanish
Botni ishga tushirgandan so‘ng /start komandasini yuboring.
Telefon raqamingizni (+998 bilan boshlanadigan) yuboring.
Belgilangan Telegram kanaliga a’zo bo‘ling.
Asosiy menyudan kerakli xizmatni tanlang:
⭐ Premium sotib olish
💎 Stars sotib olish
👥 Stars ishlash
🚘 Support bilan bog‘lanish
Eslatmalar
Bot faqat O‘zbekiston telefon raqamlari (+998) bilan ishlaydi.
Referral tizimi orqali har bir taklif qilingan foydalanuvchi uchun 1 yulduz beriladi.
50 yulduzdan keyin ularni almashtirish mumkin.
To‘lovlar Click va Paynet orqali amalga oshiriladi.



# ============================================================
На русском языке
О проекте
Этот проект представляет собой Telegram-бот, который предоставляет пользователям возможность покупать премиум-услуги и "звезды" (stars), а также зарабатывать звезды через реферальную систему. Бот интегрирован с базой данных MongoDB и поддерживает функции хранения данных пользователей, проверки членства в канале и управления заказами.

Основные функции:
Регистрация: Пользователи регистрируются с использованием номера телефона, начинающегося с +998.
Проверка членства в канале: Для использования бота необходимо быть подписанным на указанный Telegram-канал.
Реферальная система: Приглашайте друзей и получайте 1 звезду за каждого нового пользователя.
Премиум-услуги: Покупка премиум-пакетов на 3 месяца, 6 месяцев или 1 год.
Покупка звезд: Возможность приобрести от 50 до 5000 звезд.
Управление заказами: Заказы отправляются администраторам, оплата производится через Click или Paynet.
Поддержка: Пользователи могут связаться с администратором для получения помощи.
Запуск проекта
Требования:
Node.js (версия 14 или выше)
MongoDB (база данных)
Токен Telegram-бота (получается через BotFather)
Настройка переменных окружения в файле .env:
text

Свернуть

Перенос

Копировать
BOT_TOKEN=your_bot_token
BOT_USERNAME=@your_bot_username
REQUIRED_CHANNEL=@your_channel
ADMIN_CHAT_ID=your_admin_chat_id
SUPPORT_USERNAME=@your_support_username
MONGODB_URI=your_mongodb_connection_string
Установка:
bash

Свернуть

Перенос

Исполнить

Копировать
git clone <repository_url>
cd <project_folder>
npm install
Настройка .env: Создайте файл .env в корне проекта и заполните указанные переменные.
Запуск проекта:
bash

Свернуть

Перенос

Исполнить

Копировать
npm start
Подключение к MongoDB: Убедитесь, что база данных MongoDB подключена. Настройки подключения находятся в файле db/db.js.
Структура проекта
index.js: Основной файл бота, содержащий всю логику.
db/db.js: Конфигурация для подключения к MongoDB.
models/User.js: Модель Mongoose для данных пользователей.
.env: Хранит конфиденциальную информацию (токены, ID канала и т.д.).
.gitignore: Список файлов, исключенных из контроля версий.
Использование
После запуска бота отправьте команду /start.
Укажите номер телефона (начинающийся с +998).
Подпишитесь на указанный Telegram-канал.
Выберите услугу из главного меню:
⭐ Покупка премиума
💎 Покупка звезд
👥 Заработок звезд
🚘 Связь с поддержкой
Примечания
Бот работает только с узбекистанскими номерами (+998).
За каждого приглашенного пользователя начисляется 1 звезда.
После накопления 50 звезд их можно обменять.
Оплата осуществляется через Click или Paynet.
Qo‘shimcha eslatma / Дополнительное примечание
Agar loyihada qo‘shimcha funksiyalar yoki o‘zgarishlar bo‘lsa, README faylini moslashtirish uchun qo‘shimcha ma’lumot bering. / Если в проекте есть дополнительные функции или изменения, предоставьте дополнительную информацию для настройки README.

text

Свернуть

Перенос

Копировать
### Izohlar:
- Ushbu `README.md` fayli loyihangizni to‘liq tasvirlaydi va ishlab chiquvchilar yoki foydalanuvchilar uchun loyihani tushunish va ishga tushirishni osonlashtiradi.
- Faylni loyiha ildizida `README.md` sifatida saqlashingiz mumkin.
- Agar qo‘shimcha bo‘limlar (masalan, test qilish, xatolarni bartaraf etish yoki boshqa maxsus ko‘rsatmalar) qo‘shish kerak bo‘lsa, iltimos, xabar bering, men faylni moslashtiraman!