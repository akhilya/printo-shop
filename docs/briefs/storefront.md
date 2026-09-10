# Brief: витрина v1

## Feature Summary

Гостевой интернет-магазин: каталог, карточка, корзина-шторка, чекаут Т-Банк, отзывы, юридические страницы. Каталог читает Medusa Store API. Дизайн-код: `DESIGN.md`.

## Primary User Action

Найти товар по имени и купить его.

## Design Direction

См. `DESIGN.md` и `.impeccable.md`. Shopify-editorial + Yeezy B/W.

## Layout Strategy

Шапка-линия, сетка без плиток. Главная — гибрид групп и товаров. Каталог `/products`, группы `/groups`. Карточка товара и карточка группы делят одну типографику. Отзывы на карточке товара. Юридические — узкая колонка.

## Key States

Пустой каталог, пустой поиск, пустая корзина, загрузка сетки, ошибка сети, нет группы, нет отзывов, чекаут до/после Т-Банка.

## Interaction Model

Поиск сабмитом. Добавление открывает шторку. Шторка скроллит каталог под собой. Чекаут уводит на PaymentURL.

## Content Requirements

RU copy в DESIGN.md. Имя магазина — заглушка «Shop».

## References

impeccable spatial-design, typography, ux-writing, interaction-design; distill; quieter; emil-design-eng (drawer, press).

## Open Questions

Модерация отзывов — позже. Настоящее имя магазина — позже.
