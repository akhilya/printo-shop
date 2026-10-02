import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChartBar } from "@medusajs/icons"
import { Button, Container, Heading, Text } from "@medusajs/ui"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

type Period = "today" | "7d" | "30d"

type SeriesRow = {
  key: string
  label: string
  views: number
  visitors: number
  orders: number
}

type PageRow = {
  path: string
  label: string
  views: number
  visitors: number
}

type SourceRow = {
  source: string
  label: string
  views: number
  visitors: number
}

type Analytics = {
  period: Period
  active: number
  views: number
  visitors: number
  carts: number
  checkouts: number
  orders: number
  paid: number
  custom_orders: number
  custom_paid: number
  revenue: number
  average: number | null
  conversion: number | null
  pages: PageRow[]
  sources: SourceRow[]
  series: SeriesRow[]
  truncated: boolean
  orders_error: boolean
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
]

function num(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value)
}

function rub(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value)
}

function pct(value: number | null) {
  if (value == null) return "—"
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value * 100)}%`
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-lg border border-ui-border-base px-4 py-3">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="large" weight="plus" className="mt-1">
        {value}
      </Text>
      {hint ? (
        <Text size="small" className="text-ui-fg-subtle">
          {hint}
        </Text>
      ) : null}
    </div>
  )
}

function Bars({ rows }: { rows: SeriesRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.views))
  const step = rows.length > 14 ? 5 : rows.length > 10 ? 3 : 1
  return (
    <div>
      <div className="flex h-28 items-end gap-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex h-full min-w-0 flex-1 items-end"
            title={`${row.label}: ${num(row.views)} просмотров, ${num(row.orders)} заказов`}
          >
            <div
              className="w-full rounded-sm bg-ui-fg-interactive"
              style={{
                height: `${Math.max(row.views ? 8 : 0, (row.views / max) * 100)}%`,
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1">
        {rows.map((row, index) => (
          <Text
            key={row.key}
            size="small"
            className="min-w-0 flex-1 text-center text-ui-fg-subtle"
          >
            {index % step === 0 ? row.label : ""}
          </Text>
        ))}
      </div>
    </div>
  )
}

const ShopAnalyticsPage = () => {
  const [period, setPeriod] = useState<Period>("today")
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-shop-analytics", period],
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    queryFn: () =>
      sdk.client.fetch<{ analytics: Analytics }>("/admin/shop-analytics", {
        query: { period },
      }),
  })
  const analytics = data?.analytics

  if (isError && !analytics) {
    return (
      <Container className="p-6">
        <Heading>Аналитика</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Не удалось загрузить аналитику.
        </Text>
      </Container>
    )
  }

  const orderHint = analytics?.custom_orders
    ? `заявки ${num(analytics.custom_orders)}`
    : undefined

  return (
    <Container className="flex flex-col gap-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading>Аналитика</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Заказы, посетители и просмотры страниц. «Сейчас на сайте» — кто
            открыт последние 5 минут.
          </Text>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((item) => (
            <Button
              key={item.id}
              size="small"
              variant={period === item.id ? "primary" : "secondary"}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && !analytics ? (
        <Text size="small" className="text-ui-fg-subtle">
          Считаю…
        </Text>
      ) : analytics ? (
        <>
          {analytics.orders_error ? (
            <Text size="small" className="text-ui-fg-subtle">
              Заказы за период не посчитались.
            </Text>
          ) : null}
          {analytics.truncated ? (
            <Text size="small" className="text-ui-fg-subtle">
              За период слишком много просмотров, показана часть.
            </Text>
          ) : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Сейчас на сайте"
              value={num(analytics.active)}
              hint="за 5 минут"
            />
            <Stat label="Просмотры" value={num(analytics.views)} />
            <Stat label="Посетители" value={num(analytics.visitors)} />
            <Stat
              label="Заказы"
              value={num(analytics.orders)}
              hint={orderHint}
            />
            <Stat
              label="Сумма оплат"
              value={rub(analytics.revenue)}
              hint={analytics.paid ? `${num(analytics.paid)} оплат` : undefined}
            />
            <Stat
              label="Средний чек"
              value={analytics.average == null ? "—" : rub(analytics.average)}
            />
            <Stat label="В корзину" value={num(analytics.carts)} />
            <Stat
              label="Конверсия"
              value={pct(analytics.conversion)}
              hint={`до оплаты ${num(analytics.checkouts)}`}
            />
          </div>

          <div>
            <Heading level="h2">Просмотры</Heading>
            <div className="mt-3">
              <Bars rows={analytics.series} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <Heading level="h2">Ссылки</Heading>
              <Text size="small" className="mb-3 text-ui-fg-subtle">
                Сколько раз открыли каждую страницу.
              </Text>
              {analytics.pages.length ? (
                <div className="divide-y divide-ui-border-base">
                  {analytics.pages.map((row) => (
                    <div
                      key={row.path}
                      className="flex items-center justify-between gap-4 py-2"
                    >
                      <div className="min-w-0">
                        <Text>{row.label}</Text>
                        {row.label !== row.path ? (
                          <Text size="small" className="text-ui-fg-subtle">
                            {row.path}
                          </Text>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <Text>{num(row.views)}</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {num(row.visitors)} чел.
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">
                  Пока никто не открывал страницы.
                </Text>
              )}
            </div>
            <div>
              <Heading level="h2">Откуда пришли</Heading>
              <Text size="small" className="mb-3 text-ui-fg-subtle">
                Сайт, с которого перешли, или прямой заход.
              </Text>
              {analytics.sources.length ? (
                <div className="divide-y divide-ui-border-base">
                  {analytics.sources.map((row) => (
                    <div
                      key={row.source || "direct"}
                      className="flex items-center justify-between gap-4 py-2"
                    >
                      <Text>{row.label}</Text>
                      <div className="text-right">
                        <Text>{num(row.views)}</Text>
                        <Text size="small" className="text-ui-fg-subtle">
                          {num(row.visitors)} чел.
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Text size="small" className="text-ui-fg-subtle">
                  Переходов пока нет.
                </Text>
              )}
            </div>
          </div>
        </>
      ) : null}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Аналитика",
  icon: ChartBar,
  rank: 4,
})

export default ShopAnalyticsPage
