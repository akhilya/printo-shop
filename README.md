# Магазин миниатюр

Интернет-магазин фотополимерных и пластиковых фигурок.

**Движок: Medusa 2.20** (headless). Витрину пишем сами, без темы и без Next.js-стартера.

```text
Delegat.Module (каталог)  →  адаптер  →  Medusa (корзина, заказы, оплата)
                                            ↓
                                      своя витрина (позже)
```

| Задача | Где живёт |
| --- | --- |
| Каталог, фото, атрибуты | [Delegat.Module](https://module.delegat.pro) |
| Корзина, чекаут, клиенты, заказы | Medusa `apps/backend` |
| Т-Банк | модуль Medusa (ещё не написан) |
| Витрина | отдельное приложение, стек любой |

Почему не WooCommerce / OpenCart: витрина должна быть с нуля, без перетирания чужих стилей. Medusa отдаёт Store API; UI не зависит от админки.

## Требования

- Node.js 22.12+ (сейчас в репозитории стоит npm)
- Docker Desktop
- Delegat.Module — источник каталога, подключится адаптером позже

## Запуск

Первый раз — миграции и админ (один раз на базу):

```bash
docker compose up -d
cd apps/backend
npx medusa db:migrate
npx medusa user -e admin@shop.local -p admin
cd ../..
```

Дальше магазин одной командой (Postgres + Redis, бэкенд :9000, витрина :8000):

```bash
npm run shop
```

Отдельно: `npm run backend:dev`, `npm run storefront:dev`. Без Docker: `npm run dev`.

Креды админа — `ADMIN_EMAIL` / `ADMIN_PASSWORD` в `apps/backend/.env`.

| | Адрес |
| --- | --- |
| Витрина | http://localhost:8000 |
| Admin | http://localhost:9000/app |
| Логин | `admin@shop.local` / `admin` |
| Store API | http://localhost:9000 |

Первый `db:migrate` поднимает схему и сидит магазин: валюта **RUB**, регион **Россия**, склад, черновая доставка СДЭК. Демо-товаров нет — каталог придёт из PIM.

Publishable API key: **Settings → Publishable API Keys**.

Остановить инфру (данные сохранятся): `docker compose down`  
Сбросить базу: `docker compose down -v`

## Структура

```text
shop/
├── DESIGN.md           дизайн-код витрины
├── .impeccable.md      контекст для дизайн-скиллов
├── apps/backend/       Medusa
├── apps/storefront/    Vue-витрина :8000
├── docker-compose.yml
└── README.md
```

Витрины в `apps/storefront` нет специально. Кастомный UI — отдельный шаг.

## Подключение Delegat.Module

В админке Medusa: **Делегат** — URL моста, счётчики каталога и создание секретного ключа.

В PIM создайте подключение **Medusa**:
- URL: `https://api.example.com/admin/delegat` (локально `http://localhost:9000/admin/delegat`)
- API-ключ: `sk_…` со страницы Делегат

Плагин адаптера: `dashboard/plugins/Delegat.Marketplace.Medusa`.

## Т-Банк

Провайдер `pp_tbank_tbank`. Ключ, пароль, контур и URL задаются в админке: **Настройки**.

Webhook: `POST /hooks/tbank` (ответ `OK`). После старта включите провайдер: **Settings → Regions → Россия → Payment providers**.

Дальше: витрина.

## Деплой на Dokploy

Compose-файл: `docker-compose.dokploy.yml`.

1. В Dokploy создайте **Compose** и подключите репозиторий.
2. Укажите compose path: `docker-compose.dokploy.yml`.
3. В Environment вставьте переменные из `.env.dokploy.example`. Нужен `POSTGRES_PASSWORD`. **Не задавайте `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_DB`** — в Docker пользователь/база всегда `medusa`, хост `printo-pg`. Старый volume `shop_postgres` можно удалить, данные теперь в `shop_pgdata`.
4. DNS: A-записи `shop.example.com` и `api.example.com` на сервер Dokploy.
5. Deploy. После `Frontend build completed successfully` Docker ещё собирает финальный образ — это может быть несколько минут без новых строк в логе. Первый старт бэкенда тоже молчит, пока идут миграции (`Running database migrations...`).

После первого запуска создайте админа:

```bash
docker compose -f docker-compose.dokploy.yml exec backend npx medusa user -e you@shop.local -p 'пароль'
```

Витрине нужен только `VITE_MEDUSA_BACKEND_URL` (адрес API). Publishable key и id региона она запрашивает у бэкенда сама.

Т-Банк webhook: `https://api.example.com/hooks/tbank`. Терминал и пароль — в админке **Настройки**. Провайдер `pp_tbank_tbank` включается в регионе при старте бэкенда. В образ положены сертификаты НУЦ Минцифры (`NODE_EXTRA_CA_CERTS`). Режим витрины «в разработке» — в админке **Настройки**.
