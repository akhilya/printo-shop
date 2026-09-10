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

1. Secret API key (`sk_…`):

```bash
cd apps/backend
npx medusa exec ./src/scripts/create-delegat-key.ts
```

Или в админке: **Settings → Developer → Secret API Keys**.
2. В Delegat создайте подключение **Medusa**:
   - URL: `http://localhost:9000/admin/delegat` (с хоста Docker: `http://host.docker.internal:9000/admin/delegat`)
   - API-ключ: тот же `sk_…`

Плагин адаптера: `dashboard/plugins/Delegat.Marketplace.Medusa`.

## Т-Банк

Провайдер `pp_tbank_tbank`. Одностадийная оплата (`PayType=O`): покупатель уходит на `PaymentURL`, банк бьёт webhook `POST /hooks/tbank` (ответ `OK`).

В `apps/backend/.env`:

```
TBANK_TERMINAL_KEY=
TBANK_PASSWORD=
TBANK_API_URL=https://rest-api-test.tinkoff.ru/v2
```

Тестовый контур: `rest-api-test.tinkoff.ru`. Бой: `https://securepay.tinkoff.ru/v2`.

После старта сервера включите провайдер в админке: **Settings → Regions → Россия → Payment providers**.

Дальше: витрина.

## Деплой на Dokploy

Compose-файл: `docker-compose.dokploy.yml`.

1. В Dokploy создайте **Compose** и подключите репозиторий.
2. Укажите compose path: `docker-compose.dokploy.yml`.
3. В Environment вставьте переменные из `.env.dokploy.example` (свои домены и секреты).
4. DNS: A-записи `shop.example.com` и `api.example.com` на сервер Dokploy.
5. Deploy.

После первого запуска создайте админа:

```bash
docker compose -f docker-compose.dokploy.yml exec backend npx medusa user -e you@shop.local -p 'пароль'
```

В админке (`https://api.example.com/app`): publishable key → `VITE_MEDUSA_PUBLISHABLE_KEY`, регион Россия → `VITE_MEDUSA_REGION_ID`. Пересоберите витрину, если ключ задали после первого билда — он зашивается в бандл на `docker build`.

Т-Банк webhook: `https://api.example.com/hooks/tbank`. Режим витрины «в разработке» — в админке **Витрина**.
