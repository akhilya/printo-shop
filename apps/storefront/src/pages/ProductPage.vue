<script setup>
import { Star } from "@lucide/vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { bindPageBusy } from "../lib/page-busy.js"
import { useRoute, useRouter } from "vue-router"
import ImgWait from "../components/ImgWait.vue"
import LuckyBanner from "../components/LuckyBanner.vue"
import PhotoLightbox from "../components/PhotoLightbox.vue"
import ProductPhoto from "../components/ProductPhoto.vue"
import ProductRail from "../components/ProductRail.vue"
import SelectField from "../components/SelectField.vue"
import SiteBanner from "../components/SiteBanner.vue"
import {
  isAdultConfirmed,
  isAdultProduct,
  requestAdultConfirm,
} from "../lib/adult-gate.js"
import { addToCart, cartState, setQty } from "../lib/cart.js"
import { cartLineForVariant } from "../lib/cart-line.js"
import { reportForm } from "../lib/form-valid.js"
import { applyShopSeo } from "../lib/seo-head.js"
import { shopPhotoSrc } from "../lib/photo-url.js"
import { SHOP_NAME, shopProductNode } from "../lib/seo.js"
import {
  descriptionParagraphs,
  listShopCatalog,
  productFields,
  productGroup,
  productImage,
  productSpecs,
  realVariants,
  recordProductView,
  BACKEND_URL,
  REGION_ID,
  sdk,
  shopError,
  storeHeaders,
} from "../lib/sdk.js"
import { variantSalePrice } from "../lib/sales.js"
import {
  OUT_OF_STOCK_LABEL,
  shuffleInStockFirst,
  variantInStock,
} from "../lib/product-stock.js"

const MAX_REVIEW_PHOTOS = 6

const route = useRoute()
const router = useRouter()
const product = ref(null)
const related = ref([])
const reviews = ref([])
const banners = ref([])
const active = ref(0)
const thumbsEl = ref(null)
const galleryMain = ref(null)
const dragPx = ref(0)
const galleryDragging = ref(false)
let gallerySwipe = null
let gallerySwiped = false
const variantId = ref("")
const loading = ref(true)
bindPageBusy(loading)
const allowed = ref(false)
const error = ref("")
const reviewForm = ref({ author: "", body: "", rating: 0 })
const reviewPhotos = ref([])
const reviewBusy = ref(false)
const reviewError = ref("")
const reviewSent = ref(false)
const lightbox = ref(null)
let alive = true

async function allowProduct(next) {
  if (!isAdultProduct(next) || isAdultConfirmed()) {
    allowed.value = true
    return true
  }
  allowed.value = false
  const ok = await requestAdultConfirm()
  if (!alive) return false
  if (!ok) {
    router.replace("/products")
    return false
  }
  allowed.value = true
  return true
}

async function load() {
  loading.value = true
  allowed.value = false
  error.value = ""
  reviewSent.value = false
  lightbox.value = null
  try {
    const { products } = await sdk.store.product.list({
      handle: route.params.handle,
      region_id: REGION_ID,
      fields: productFields,
    })
    const next = products?.[0]
    if (!next) {
      throw new Error("not found")
    }
    product.value = next
    variantId.value = next.variants?.[0]?.id || ""
    active.value = 0
    lightbox.value = null
    loading.value = false
    applyProductSeo(next)
    if (!(await allowProduct(next))) return
    recordProductView(next.id)
    await Promise.all([loadRelated(next), loadReviews(next.id), loadBanners()])
  } catch {
    product.value = null
    error.value = "Товар не найден"
    loading.value = false
    applyShopSeo({
      path: route.path,
      title: "Товар не найден",
      description: "Такого товара нет.",
      robots: "noindex, follow",
    })
  }
}

const images = computed(() => product.value?.images || [])
const variants = computed(() => product.value?.variants || [])
const specs = computed(() =>
  product.value ? productSpecs(product.value) : []
)
const choices = computed(() => realVariants(product.value))
const paragraphs = computed(() =>
  descriptionParagraphs(product.value?.description)
)
const group = computed(() => productGroup(product.value))
const selectedVariant = computed(
  () => variants.value.find((item) => item.id === variantId.value) || variants.value[0]
)
const price = computed(() =>
  variantSalePrice(selectedVariant.value, product.value)
)
const cartLine = computed(() =>
  cartLineForVariant(cartState.cart, variantId.value)
)
const inStock = computed(() => variantInStock(selectedVariant.value))
const customOrderBanner = computed(() => {
  if (!product.value?.id) return null
  return {
    slot: "product_custom",
    title: "Индивидуальный заказ",
    body: "Нужна другая версия этой фигурки или правки под ваш запрос — опишите, что сделать.",
    cta_label: "Оставить заявку",
    cta_href: `/custom-order?product=${product.value.id}`,
  }
})

function applyProductSeo(next = product.value) {
  if (!next) return
  const variant =
    variants.value.find((item) => item.id === variantId.value) ||
    next.variants?.[0]
  const calc = variant?.calculated_price || {}
  const amount = Number(calc.calculated_amount ?? calc.original_amount)
  const rated = (reviews.value || []).filter((row) => Number(row.rating) > 0)
  const ratingCount = rated.length
  const ratingValue = ratingCount
    ? rated.reduce((sum, row) => sum + Number(row.rating), 0) / ratingCount
    : 0
  const collection = productGroup(next)
  const crumbs = [
    { name: SHOP_NAME, path: "/" },
    { name: "Товары", path: "/products" },
  ]
  if (collection) crumbs.push({ name: collection.title, path: collection.path })
  crumbs.push({ name: next.title, path: `/p/${next.handle}` })
  applyShopSeo({
    path: `/p/${next.handle}`,
    title: next.title,
    description:
      descriptionParagraphs(next.description).join(" ") ||
      `${next.title} в магазине PrintO.`,
    image: productImage(next),
    ogType: "product",
    crumbs,
    product: shopProductNode({
      origin: window.location.origin,
      path: `/p/${next.handle}`,
      name: next.title,
      image: productImage(next),
      description: descriptionParagraphs(next.description).join(" "),
      sku: variant?.sku,
      price: amount,
      inStock: variantInStock(variant),
      adult: isAdultProduct(next),
      ratingCount,
      ratingValue: Math.round(ratingValue * 10) / 10,
    }),
  })
}

async function loadRelated(p) {
  related.value = []
  const collectionId = p.collection_id || p.collection?.id
  if (!collectionId) return
  try {
    const { products } = await listShopCatalog({
      collectionId,
      limit: 16,
    })
    related.value = shuffleInStockFirst(
      (products || []).filter((item) => item.id !== p.id)
    )
  } catch {
    related.value = []
  }
}

async function loadBanners() {
  try {
    const res = await fetch(`${BACKEND_URL}/store/banners`, {
      headers: storeHeaders(),
    })
    if (!res.ok) {
      banners.value = []
      return
    }
    const data = await res.json()
    banners.value = data.banners || []
  } catch {
    banners.value = []
  }
}

function bannerBySlot(slot) {
  return banners.value.find((item) => item.slot === slot) || null
}

async function loadReviews(productId) {
  reviewsOpen.value = false
  try {
    const res = await fetch(
      `${BACKEND_URL}/store/reviews?product_id=${encodeURIComponent(productId)}`,
      { headers: storeHeaders() }
    )
    if (!res.ok) {
      reviews.value = []
      return
    }
    const data = await res.json()
    reviews.value = data.reviews || []
    applyProductSeo()
  } catch {
    reviews.value = []
  }
}

function reviewRank(review) {
  return [
    Number(review?.rating) === 5 ? 1 : 0,
    reviewImages(review).length,
    String(review?.body || "").length,
  ]
}

const leadReview = computed(() => {
  const rows = reviews.value || []
  if (!rows.length) return null
  const marked = rows.find((row) => row.pinned)
  if (marked) return marked
  return [...rows].sort((a, b) => {
    const left = reviewRank(a)
    const right = reviewRank(b)
    return right[0] - left[0] || right[1] - left[1] || right[2] - left[2]
  })[0]
})

const otherReviews = computed(() =>
  (reviews.value || []).filter((row) => row.id !== leadReview.value?.id)
)

const reviewsOpen = ref(false)

const visibleReviews = computed(() => {
  const lead = leadReview.value
  if (!lead) return []
  if (!reviewsOpen.value) return [lead]
  return [lead, ...otherReviews.value]
})

function reviewImages(review) {
  if (Array.isArray(review?.image_urls) && review.image_urls.length) {
    return review.image_urls.filter(Boolean)
  }
  return review?.image_url ? [review.image_url] : []
}

function clearReviewPhotos() {
  for (const item of reviewPhotos.value) {
    if (item.preview) URL.revokeObjectURL(item.preview)
  }
  reviewPhotos.value = []
}

function onReviewPhotos(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ""
  reviewError.value = ""
  for (const file of files) {
    if (reviewPhotos.value.length >= MAX_REVIEW_PHOTOS) {
      reviewError.value = `Можно прикрепить не больше ${MAX_REVIEW_PHOTOS} фото`
      break
    }
    if (!file.type.startsWith("image/")) {
      reviewError.value = "Нужен файл изображения"
      continue
    }
    if (file.size > 5 * 1024 * 1024) {
      reviewError.value = "Фото больше 5 МБ"
      continue
    }
    reviewPhotos.value.push({
      file,
      preview: URL.createObjectURL(file),
    })
  }
}

function removeReviewPhoto(index) {
  const item = reviewPhotos.value[index]
  if (item?.preview) URL.revokeObjectURL(item.preview)
  reviewPhotos.value.splice(index, 1)
}

function openReviewLightbox(urls, index) {
  if (!urls?.[index]) return
  lightbox.value = { images: urls, index, alt: "Фото отзыва" }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("read"))
    reader.readAsDataURL(file)
  })
}

async function submitReview(event) {
  event.preventDefault()
  reviewError.value = ""
  if (!reportForm(event.currentTarget)) return
  if (!reviewForm.value.rating) {
    reviewError.value = "Поставьте оценку от 1 до 5"
    return
  }
  reviewBusy.value = true
  try {
    const payload = {
      product_id: product.value.id,
      author: reviewForm.value.author.trim(),
      body: reviewForm.value.body.trim(),
      rating: reviewForm.value.rating,
    }
    if (reviewPhotos.value.length) {
      payload.images = []
      for (const item of reviewPhotos.value) {
        payload.images.push({ content: await fileToBase64(item.file) })
      }
    }
    const res = await fetch(`${BACKEND_URL}/store/reviews`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...storeHeaders(),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      reviewError.value = shopError(data.message, "Не удалось отправить отзыв")
      return
    }
    reviewForm.value = { author: "", body: "", rating: 0 }
    clearReviewPhotos()
    reviewSent.value = true
    await loadReviews(product.value.id)
  } catch {
    reviewError.value = "Не удалось отправить отзыв"
  } finally {
    reviewBusy.value = false
  }
}

function openZoom() {
  const urls = images.value.map((img) => img.url).filter(Boolean)
  if (!urls.length) return
  const current = images.value[active.value]?.url
  const index = Math.max(0, urls.indexOf(current))
  lightbox.value = {
    images: urls,
    index,
    alt: product.value?.title || "Фото",
  }
}

function onLightboxIndex(index) {
  if (!lightbox.value) return
  lightbox.value = { ...lightbox.value, index }
  if (lightbox.value.alt !== "Фото отзыва") {
    active.value = index
  }
}

onBeforeUnmount(() => {
  alive = false
  clearReviewPhotos()
})

watch(() => route.params.handle, load, { immediate: true })
watch(variantId, () => applyProductSeo())
const gallerySlides = computed(() =>
  images.value.length ? images.value : [{ url: "" }]
)

const galleryShift = computed(() => {
  const base = `-${active.value * 100}%`
  if (!galleryDragging.value) return `translate3d(${base}, 0, 0)`
  return `translate3d(calc(${base} + ${dragPx.value}px), 0, 0)`
})

function onGalleryPointerDown(event) {
  gallerySwiped = false
  if (event.pointerType === "mouse" || images.value.length < 2) return
  const frame = galleryMain.value?.getBoundingClientRect()
  if (!frame?.width) return
  gallerySwipe = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    width: frame.width,
    axis: "",
  }
  galleryMain.value.setPointerCapture?.(event.pointerId)
}

function onGalleryPointerMove(event) {
  if (!gallerySwipe || event.pointerId !== gallerySwipe.id) return
  const dx = event.clientX - gallerySwipe.x
  const dy = event.clientY - gallerySwipe.y
  if (!gallerySwipe.axis) {
    if (Math.hypot(dx, dy) < 8) return
    gallerySwipe.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
  }
  if (gallerySwipe.axis !== "x") return
  const last = images.value.length - 1
  let next = dx
  if ((active.value <= 0 && next > 0) || (active.value >= last && next < 0)) {
    next *= 0.3
  }
  galleryDragging.value = true
  dragPx.value = next
}

function onGalleryPointerUp(event) {
  if (!gallerySwipe || event.pointerId !== gallerySwipe.id) return
  const { width, axis } = gallerySwipe
  const dx = dragPx.value
  const last = images.value.length - 1
  gallerySwipe = null
  galleryDragging.value = false
  dragPx.value = 0
  if (axis !== "x") return
  gallerySwiped = true
  const pass = Math.abs(dx) > Math.max(28, width * 0.18)
  if (pass && dx < 0 && active.value < last) active.value += 1
  else if (pass && dx > 0 && active.value > 0) active.value -= 1
}

function onGalleryClick() {
  if (gallerySwiped) {
    gallerySwiped = false
    return
  }
  openZoom()
}

watch(active, (index) => {
  const strip = thumbsEl.value
  const thumb = strip?.children?.[index]
  if (!strip || !thumb) return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const left = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2
  strip.scrollTo({
    left: Math.max(0, left),
    behavior: reduce ? "auto" : "smooth",
  })
})
</script>

<template>
  <p v-if="!loading && error" class="err">{{ error }}</p>
  <article v-else-if="!loading && product && allowed">
    <div class="product" :class="{ 'is-oos': !inStock }">
      <div class="gallery">
        <button
          ref="galleryMain"
          type="button"
          class="matte gallery-main"
          :disabled="!images[active]?.url"
          aria-label="Увеличить фото"
          @pointerdown="onGalleryPointerDown"
          @pointermove="onGalleryPointerMove"
          @pointerup="onGalleryPointerUp"
          @pointercancel="onGalleryPointerUp"
          @click="onGalleryClick"
        >
          <div
            class="gallery-track"
            :class="{ 'is-dragging': galleryDragging }"
            :style="{ transform: galleryShift }"
          >
            <ProductPhoto
              v-for="(img, i) in gallerySlides"
              :key="img.id || i"
              class="gallery-slide"
              :src="img.url || ''"
              :alt="i === active ? product.title : ''"
              :eager="Math.abs(i - active) < 2"
              :fetchpriority="i === active ? 'high' : ''"
              fill
            />
          </div>
        </button>
        <div v-if="images.length > 1" ref="thumbsEl" class="thumbs">
          <button
            v-for="(img, i) in images"
            :key="img.id || i"
            type="button"
            :aria-current="i === active"
            :aria-label="`Фото ${i + 1}`"
            @click="active = i"
          >
            <ProductPhoto :src="img.url" alt="" />
          </button>
        </div>
      </div>
      <div class="buy">
        <div class="buy-head">
          <router-link
            v-if="group"
            class="group-link"
            :to="group.path"
          >
            {{ group.title }}
          </router-link>
          <h1 class="product-title">{{ product.title }}</h1>
        </div>
        <div class="price price-row">
          <span v-if="price.onSale" class="price-was">{{ price.original }}</span>
          <span>{{ price.current }}</span>
        </div>
        <SelectField v-if="choices.length">
          <select v-model="variantId" aria-label="Вариант">
            <option v-for="v in choices" :key="v.id" :value="v.id">
              {{ v.title }}
            </option>
          </select>
        </SelectField>
        <p v-if="!inStock" class="oos">{{ OUT_OF_STOCK_LABEL }}</p>
        <div v-else-if="cartLine" class="in-cart">
          <p class="in-cart-label">В корзине</p>
          <div class="buy-qty">
            <button
              type="button"
              :disabled="cartState.busy"
              :aria-label="cartLine.quantity < 2 ? 'Убрать из корзины' : 'Меньше'"
              @click="setQty(cartLine.id, cartLine.quantity - 1)"
            >
              −
            </button>
            <span>{{ cartLine.quantity }}</span>
            <button
              type="button"
              :disabled="cartState.busy"
              aria-label="Больше"
              @click="setQty(cartLine.id, cartLine.quantity + 1)"
            >
              +
            </button>
          </div>
        </div>
        <button
          v-else
          class="btn"
          type="button"
          :disabled="!variantId || cartState.busy"
          @click="addToCart(variantId)"
        >
          В корзину
        </button>
        <p v-if="cartState.error" class="err">{{ cartState.error }}</p>
        <dl v-if="specs.length" class="specs">
          <div v-for="row in specs" :key="row.key || row.label" class="spec">
            <dt>{{ row.label }}</dt>
            <dd>{{ row.value }}</dd>
          </div>
        </dl>
        <div v-if="paragraphs.length" class="desc">
          <p v-for="(block, i) in paragraphs" :key="i">{{ block }}</p>
        </div>
      </div>
    </div>

    <SiteBanner
      v-if="customOrderBanner"
      :banner="customOrderBanner"
    />

    <ProductRail
      :title="
        group
          ? `Другие товары из коллекции ${group.title}`
          : 'Другие товары'
      "
      :to="group?.path"
      :products="related"
    />

    <section class="section reviews-section">
      <button
        type="button"
        class="reviews-toggle"
        :aria-expanded="reviewsOpen"
        @click="reviewsOpen = !reviewsOpen"
      >
        <h2>Отзывы<span v-if="reviews.length">, {{ reviews.length }}</span></h2>
      </button>
      <div class="reviews">
        <article v-for="r in visibleReviews" :key="r.id" class="review">
          <div class="review-head">
            <strong>{{ r.author }}</strong>
            <p
              v-if="r.rating"
              class="stars"
              :aria-label="`Оценка ${r.rating} из 5`"
            >
              <Star
                v-for="n in 5"
                :key="n"
                :size="14"
                :stroke-width="1.5"
                :fill="n <= r.rating ? 'currentColor' : 'none'"
                aria-hidden="true"
              />
            </p>
          </div>
          <p class="review-body">{{ r.body }}</p>
          <a
            v-if="r.source_url"
            class="review-source"
            :href="r.source_url"
            target="_blank"
            rel="noopener noreferrer"
          >
            Отзыв на Ozon
          </a>
          <div v-if="reviewImages(r).length" class="review-photos">
            <button
              v-for="(url, i) in reviewImages(r)"
              :key="url + i"
              type="button"
              class="review-photo-btn"
              aria-label="Открыть фото"
              @click="openReviewLightbox(reviewImages(r), i)"
            >
              <ImgWait :src="shopPhotoSrc(url)" alt="" />
            </button>
          </div>
        </article>
        <template v-if="reviewsOpen">
          <p v-if="!reviews.length" class="empty">Отзывов пока нет</p>
          <p v-if="reviewSent" class="empty">
            Отзыв отправили на модерацию. Он появится после проверки.
          </p>
          <form v-else class="form review-form" @submit="submitReview">
            <label>
              Имя
              <input v-model="reviewForm.author" type="text" required />
            </label>
            <fieldset class="stars-field">
              <legend>Оценка</legend>
              <div class="stars stars-input">
                <button
                  v-for="n in 5"
                  :key="n"
                  type="button"
                  :aria-label="`${n} из 5`"
                  :aria-pressed="reviewForm.rating === n"
                  @click="reviewForm.rating = n"
                >
                  <Star
                    :size="22"
                    :stroke-width="1.5"
                    :fill="n <= reviewForm.rating ? 'currentColor' : 'none'"
                  />
                </button>
              </div>
            </fieldset>
            <label>
              Отзыв
              <textarea v-model="reviewForm.body" rows="4" required minlength="10" />
            </label>
            <label class="file">
              Фото
              <span class="file-pick">
                Выбрать фото
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  @change="onReviewPhotos"
                />
              </span>
            </label>
            <div v-if="reviewPhotos.length" class="review-picked">
              <div class="review-photos">
                <div
                  v-for="(item, i) in reviewPhotos"
                  :key="item.preview"
                  class="review-picked-item"
                >
                  <button
                    type="button"
                    class="review-photo-btn"
                    aria-label="Открыть фото"
                    @click="
                      openReviewLightbox(
                        reviewPhotos.map((p) => p.preview),
                        i
                      )
                    "
                  >
                    <ImgWait :src="item.preview" alt="" />
                  </button>
                  <button
                    type="button"
                    class="btn-ghost"
                    @click="removeReviewPhoto(i)"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
            <p v-if="reviewError" class="err">{{ reviewError }}</p>
            <button class="btn" type="submit" :disabled="reviewBusy">
              {{ reviewBusy ? "Отправка" : "Отправить отзыв" }}
            </button>
          </form>
        </template>
      </div>
    </section>

    <LuckyBanner
      v-if="product && bannerBySlot('product_lucky')"
      :banner="bannerBySlot('product_lucky')"
      :exclude-id="product.id"
    />

    <PhotoLightbox
      v-if="lightbox"
      :images="lightbox.images"
      :index="lightbox.index"
      :alt="lightbox.alt"
      @close="lightbox = null"
      @update:index="onLightboxIndex"
    />
  </article>
</template>
