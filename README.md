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

## Ozon Delivery API

Delivery API настраивается отдельно от Seller API. В админке откройте **Настройки → Ozon Доставка → Ozon Delivery API** и укажите:

- Client ID и Client Secret OAuth-приложения с правами `delivery-api.delivery`, `delivery-api.delivery-point`, `delivery-api.order` и `delivery-api.posting`;
- ID активного метода доставки из `/v1/shipment-method/search`;
- вес отправления в граммах и длину, ширину и высоту в миллиметрах.

Секрет хранится в настройках магазина и не возвращается в API; пустое поле при сохранении не стирает ранее сохранённый секрет. После обновления существующей базы примените миграции из `apps/backend`: `npx medusa db:migrate`.

Индивидуальные заказы создаются через Delivery API без артикула Ozon. Для заказов каталога остаётся основной путь Seller API. Переход на Delivery API разрешён только до отправки Seller-запроса создания или если у товара нет Seller-артикула; выбранный Seller ПВЗ сопоставляется с Delivery API по адресу и координатам, ID двух API не считаются взаимозаменяемыми. Если надёжного совпадения нет, заказ не переключается на другой ПВЗ автоматически.

## Деплой на Dokploy

Образы собирает GitHub Actions (`.github/workflows/publish-images.yml`) и публикует в GHCR:

- `ghcr.io/akhilya/printo-shop/backend`
- `ghcr.io/akhilya/printo-shop/storefront`

Сервер только `docker compose pull` + `up`. Сборка на VPS больше не нужна.

1. В GitHub: **Settings → Secrets and variables → Actions → Variables** — `VITE_MEDUSA_BACKEND_URL` (например `https://api.printo.studio`). Без неё витрина собирается с этим адресом по умолчанию.
2. GitHub PAT с правом `read:packages`. В Dokploy: **Registry** → URL `ghcr.io`, username аккаунта GitHub, password = PAT. Привяжите registry к Compose-приложению.
3. В Dokploy создайте **Compose**, репозиторий, compose path: `docker-compose.dokploy.yml`. Автодеплой по git-push лучше выключить: образы ещё не готовы, пока Actions не зелёный.
4. Environment — переменные из `.env.dokploy.example`. Нужен `POSTGRES_PASSWORD`. **Не задавайте `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_DB`**.
5. Необязательно: секрет `DOKPLOY_WEBHOOK_URL` (кнопка webhook в Dokploy). Тогда после публикации образов Actions сам дёрнет деплой.
6. DNS: A-записи витрины и API на сервер Dokploy.
7. Первый раз: дождитесь зелёного workflow **Publish images**, затем Deploy в Dokploy. Первый старт бэкенда молчит, пока идут миграции.

Бэкенд каждые 5 минут проверяет сохранённые ошибки создания отправлений Ozon, в том числе ошибки до последнего деплоя. Повторные попытки идут с паузами 5 минут, 15 минут, 1 час, 6 часов, затем раз в сутки. Повторный запуск не затрагивает заказы, у которых уже сохранён номер отправления.

Если отправление не создалось, на странице заказа в админке отображаются ошибка, число попыток и время следующего повтора. Кнопка «Повторить сейчас» запускает ручную попытку без ожидания backoff.

После первого запуска создайте админа:

```bash
docker compose -f docker-compose.dokploy.yml exec backend npx medusa user -e you@shop.local -p 'пароль'
```

URL API витрины запекается в образ на CI (`VITE_MEDUSA_BACKEND_URL`). Publishable key и id региона она запрашивает у бэкенда сама.

Т-Банк webhook: `https://api.example.com/hooks/tbank`. Терминал и пароль — в админке **Настройки**. Провайдер `pp_tbank_tbank` включается в регионе при старте бэкенда. В образ положены сертификаты НУЦ Минцифры (`NODE_EXTRA_CA_CERTS`). Режим витрины «в разработке» — в админке **Настройки**.
