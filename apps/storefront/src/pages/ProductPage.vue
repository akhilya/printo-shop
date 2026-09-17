<script setup>
import { Star } from "@lucide/vue"
import { computed, onBeforeUnmount, ref, watch } from "vue"
import { useRoute } from "vue-router"
import PhotoLightbox from "../components/PhotoLightbox.vue"
import ProductPhoto from "../components/ProductPhoto.vue"
import ProductRail from "../components/ProductRail.vue"
import SelectField from "../components/SelectField.vue"
import SiteBanner from "../components/SiteBanner.vue"
import { addToCart, cartState, setQty } from "../lib/cart.js"
import { cartLineForVariant } from "../lib/cart-line.js"
import { reportForm } from "../lib/form-valid.js"
import {
  descriptionParagraphs,
  productFields,
  productGroup,
  productSpecs,
  realVariants,
  BACKEND_URL,
  REGION_ID,
  sdk,
  shopError,
  storeHeaders,
} from "../lib/sdk.js"
import { variantSalePrice } from "../lib/sales.js"
import { OUT_OF_STOCK_LABEL, variantInStock } from "../lib/product-stock.js"

const MAX_REVIEW_PHOTOS = 6

const route = useRoute()
const product = ref(null)
const related = ref([])
const reviews = ref([])
const active = ref(0)
const variantId = ref("")
const loading = ref(true)
const error = ref("")
const reviewForm = ref({ author: "", body: "", rating: 0 })
const reviewPhotos = ref([])
const reviewBusy = ref(false)
const reviewError = ref("")
const reviewSent = ref(false)
const lightbox = ref(null)

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

async function load() {
  loading.value = true
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
    await Promise.all([loadRelated(next), loadReviews(next.id)])
  } catch {
    product.value = null
    error.value = "Товар не найден"
    loading.value = false
  }
}

async function loadRelated(p) {
  related.value = []
  const collectionId = p.collection_id || p.collection?.id
  if (!collectionId) return
  try {
    const { products } = await sdk.store.product.list({
      collection_id: collectionId,
      region_id: REGION_ID,
      limit: 16,
      fields: productFields,
    })
    related.value = (products || []).filter((item) => item.id !== p.id)
  } catch {
    related.value = []
  }
}

async function loadReviews(productId) {
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
  } catch {
    reviews.value = []
  }
}

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
  clearReviewPhotos()
})

watch(() => route.params.handle, load, { immediate: true })
</script>

<template>
  <p v-if="loading" class="empty">Загрузка</p>
  <p v-else-if="error" class="err">{{ error }}</p>
  <article v-else-if="product">
    <div class="product" :class="{ 'is-oos': !inStock }">
      <div class="gallery">
        <button
          type="button"
          class="matte gallery-main"
          :disabled="!images[active]?.url"
          aria-label="Увеличить фото"
          @click="openZoom"
        >
          <ProductPhoto
            :src="images[active]?.url || ''"
            :alt="product.title"
            eager
          />
        </button>
        <div v-if="images.length > 1" class="thumbs">
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
      <h2>Отзывы</h2>
      <div class="reviews">
        <p v-if="!reviews.length" class="empty">Отзывов пока нет</p>
        <div v-for="r in reviews" :key="r.id" class="review">
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
          <p>{{ r.body }}</p>
          <div v-if="reviewImages(r).length" class="review-photos">
            <button
              v-for="(url, i) in reviewImages(r)"
              :key="url + i"
              type="button"
              class="review-photo-btn"
              aria-label="Открыть фото"
              @click="openReviewLightbox(reviewImages(r), i)"
            >
              <img :src="url" alt="" />
            </button>
          </div>
        </div>
        <p v-if="reviewSent" class="empty">
          Отзыв отправили на модерацию. Он появится после проверки.
        </p>
        <form v-else class="form" @submit="submitReview">
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
                  <img :src="item.preview" alt="" />
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
      </div>
    </section>

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
