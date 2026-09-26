<script setup>
import { computed, onMounted, ref, toRef } from "vue"
import { bindPageBusy } from "../lib/page-busy.js"
import { useRoute } from "vue-router"
import ImgWait from "../components/ImgWait.vue"
import SelectField from "../components/SelectField.vue"
import ConfirmDialog from "../components/ConfirmDialog.vue"
import { customOrderConfirmFields } from "../lib/checkout-confirm.js"
import { reportForm } from "../lib/form-valid.js"
import { persistObject } from "../lib/persist.js"
import { BACKEND_URL, productFields, REGION_ID, sdk, shopError, storeHeaders } from "../lib/sdk.js"
import { shopState } from "../lib/shop.js"

const MAX_PHOTOS = 6
const MAX_PHOTO_BYTES = 2 * 1024 * 1024
const MAX_NAME = 80
const MAX_CONTACT = 80
const MAX_MESSAGE = 4000
const route = useRoute()
const product = ref(null)
const sent = ref(false)
const busy = ref(false)
const pageLoading = ref(true)
bindPageBusy(pageLoading)
const error = ref("")
const confirmOpen = ref(false)
const form = persistObject("shop_custom_order", {
  name: "",
  email: "",
  phone: "",
  telegram: "",
  max_account: "",
  vk: "",
  message: "",
  channel: "telegram",
})
const photos = ref([])
const CHANNELS = [
  {
    id: "email",
    field: "email",
    label: "Почта",
    type: "email",
    placeholder: "name@mail.ru",
    autocomplete: "email",
  },
  {
    id: "phone",
    field: "phone",
    label: "Телефон",
    type: "tel",
    placeholder: "+7 900 000-00-00",
    autocomplete: "tel",
  },
  {
    id: "telegram",
    field: "telegram",
    label: "Telegram",
    type: "text",
    placeholder: "@username",
    autocomplete: "off",
  },
  {
    id: "max",
    field: "max_account",
    label: "MAX",
    type: "text",
    placeholder: "телефон или имя в MAX",
    autocomplete: "off",
  },
  {
    id: "vk",
    field: "vk",
    label: "ВКонтакте",
    type: "text",
    placeholder: "vk.com/id или короткое имя",
    autocomplete: "off",
  },
]
if (!CHANNELS.some((item) => item.id === form.channel)) {
  form.channel = "telegram"
}
const channel = toRef(form, "channel")
const channelMeta = computed(
  () => CHANNELS.find((item) => item.id === channel.value) || CHANNELS[0]
)
const confirmFields = computed(() =>
  customOrderConfirmFields({
    product: product.value?.title || "",
    name: form.name,
    channelLabel: channelMeta.value.label,
    contact: form[channelMeta.value.field],
    message: form.message,
  })
)

onMounted(async () => {
  const raw = typeof route.query.product === "string" ? route.query.product.trim() : ""
  try {
  if (!raw) return
  try {
    const query = raw.startsWith("prod_")
      ? { id: [raw] }
      : { handle: raw }
    const { products } = await sdk.store.product.list({
      ...query,
      region_id: REGION_ID,
      limit: 1,
      fields: productFields,
    })
    product.value = products?.[0] || null
  } catch {
    product.value = null
  }
  } finally {
    pageLoading.value = false
  }
})

function clearPhotos() {
  for (const item of photos.value) {
    if (item.preview) URL.revokeObjectURL(item.preview)
  }
  photos.value = []
}

function onPhotos(event) {
  const files = [...(event.target.files || [])]
  event.target.value = ""
  error.value = ""
  for (const file of files) {
    if (photos.value.length >= MAX_PHOTOS) {
      error.value = `Можно прикрепить не больше ${MAX_PHOTOS} фото`
      break
    }
    if (!file.type.startsWith("image/")) {
      error.value = "Нужен файл изображения"
      continue
    }
    if (file.size > MAX_PHOTO_BYTES) {
      error.value = "Фото больше 2 МБ"
      continue
    }
    photos.value.push({ file, preview: URL.createObjectURL(file) })
  }
}

function removePhoto(index) {
  const item = photos.value[index]
  if (item?.preview) URL.revokeObjectURL(item.preview)
  photos.value.splice(index, 1)
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(new Error("read"))
    reader.readAsDataURL(file)
  })
}

async function submit(event) {
  event.preventDefault()
  error.value = ""
  if (!reportForm(event.currentTarget)) return
  if (shopState.ordersClosed) {
    error.value = shopState.ordersMessage
    return
  }
  const field = channelMeta.value.field
  const contact = String(form[field] || "").trim()
  if (!contact) {
    error.value = "Укажите контакт"
    return
  }
  confirmOpen.value = true
}

async function confirmSend() {
  if (busy.value) return
  const field = channelMeta.value.field
  const contact = String(form[field] || "").trim()
  busy.value = true
  error.value = ""
  try {
    const payload = {
      name: form.name.trim(),
      email: "",
      phone: "",
      telegram: "",
      max_account: "",
      vk: "",
      message: form.message.trim(),
      product_id: product.value?.id || undefined,
      [field]: contact,
    }
    if (photos.value.length) {
      payload.images = []
      for (const item of photos.value) {
        payload.images.push({ content: await fileToBase64(item.file) })
      }
    }
    const res = await fetch(`${BACKEND_URL}/store/custom-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...storeHeaders(),
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      error.value = shopError(data.message, "Не удалось отправить заявку")
      confirmOpen.value = false
      return
    }
    sent.value = true
    confirmOpen.value = false
    clearPhotos()
  } catch {
    error.value = "Не удалось отправить заявку"
    confirmOpen.value = false
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <article class="legal">
    <h1>Индивидуальный заказ</h1>
    <p v-if="sent">
      Заявку получили. Напишем вам удобным способом, как разберём описание и фото.
    </p>
    <template v-else>
      <p>
        Нужна фигурка не из каталога или другая версия существующей — опишите,
        что хотите. Выберите, как с вами связаться.
      </p>
      <p v-if="product" class="custom-product">
        Заявка к товару:
        <router-link :to="`/p/${product.handle}`">{{ product.title }}</router-link>
      </p>
      <form class="form" @submit="submit">
        <label>
          Имя
          <input
            v-model="form.name"
            type="text"
            required
            :maxlength="MAX_NAME"
            autocomplete="name"
          />
        </label>
        <label>
          Способ связи
          <SelectField>
            <select v-model="channel" aria-label="Способ связи">
              <option v-for="item in CHANNELS" :key="item.id" :value="item.id">
                {{ item.label }}
              </option>
            </select>
          </SelectField>
        </label>
        <label>
          {{ channelMeta.label }}
          <input
            :key="channelMeta.id"
            v-model="form[channelMeta.field]"
            :type="channelMeta.type"
            :maxlength="MAX_CONTACT"
            :placeholder="channelMeta.placeholder"
            :autocomplete="channelMeta.autocomplete"
            required
          />
        </label>
        <label>
          Что сделать
          <textarea
            v-model="form.message"
            rows="6"
            required
            minlength="10"
            :maxlength="MAX_MESSAGE"
            placeholder="Масштаб, персонаж, материал, срок, референсы"
          />
        </label>
        <label class="file">
          Референсы
          <span class="form-note">До 6 фото, каждое не больше 2 МБ</span>
          <span class="file-pick">
            Выбрать фото
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              @change="onPhotos"
            />
          </span>
        </label>
        <div v-if="photos.length" class="review-photos">
          <div
            v-for="(item, i) in photos"
            :key="item.preview"
            class="review-picked-item"
          >
            <div class="review-photo-btn">
              <ImgWait :src="item.preview" alt="" />
            </div>
            <button type="button" class="btn-ghost" @click="removePhoto(i)">
              Удалить
            </button>
          </div>
        </div>
        <p v-if="shopState.ordersClosed" class="muted">{{ shopState.ordersMessage }}</p>
        <p v-if="error" class="err">{{ error }}</p>
        <button class="btn" type="submit" :disabled="busy || shopState.ordersClosed">
          Отправить заявку
        </button>
      </form>
      <ConfirmDialog
        v-if="confirmOpen"
        title="Проверьте заявку"
        confirm-label="Отправить заявку"
        busy-label="Отправка"
        :busy="busy"
        @close="confirmOpen = false"
        @confirm="confirmSend"
      >
        <dl class="confirm-rows">
          <div
            v-for="field in confirmFields"
            :key="field.label"
            class="confirm-row"
          >
            <dt>{{ field.label }}</dt>
            <dd>{{ field.value }}</dd>
          </div>
        </dl>
        <div v-if="photos.length" class="confirm-photos">
          <div v-for="item in photos" :key="item.preview" class="matte">
            <ImgWait :src="item.preview" alt="" />
          </div>
        </div>
      </ConfirmDialog>
    </template>
  </article>
</template>
