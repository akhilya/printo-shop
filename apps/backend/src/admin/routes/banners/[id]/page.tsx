import { ArrowLeft } from "@medusajs/icons"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { sdk } from "../../../lib/sdk"

type AdminBanner = {
  id: string
  slot: string
  title: string
  body: string
  cta_label: string | null
  cta_href: string | null
  image_url: string | null
  enabled: boolean
}

const SLOT_LABELS: Record<string, string> = {
  home_hero: "Главная — сверху",
  home_catalog: "Главная — каталог",
  home_custom: "Главная — индивидуальный заказ",
  home_order: "Главная — заказ",
}

const BannerEditPage = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: "",
    body: "",
    cta_label: "",
    cta_href: "",
    image_url: "",
    enabled: true,
  })

  const { data, isLoading, isError } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ banner: AdminBanner }>(`/admin/banners/${id}`),
    queryKey: ["admin-banner", id],
    enabled: Boolean(id),
  })

  useEffect(() => {
    const banner = data?.banner
    if (!banner) return
    setForm({
      title: banner.title || "",
      body: banner.body || "",
      cta_label: banner.cta_label || "",
      cta_href: banner.cta_href || "",
      image_url: banner.image_url || "",
      enabled: banner.enabled !== false,
    })
  }, [data])

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/banners/${id}`, {
        method: "POST",
        body: form,
      }),
    onSuccess: () => {
      toast.success("Баннер сохранён")
      queryClient.invalidateQueries({ queryKey: ["admin-banners"] })
      queryClient.invalidateQueries({ queryKey: ["admin-banner", id] })
    },
    onError: () => toast.error("Не удалось сохранить баннер"),
  })

  async function onUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file) return
    try {
      const uploaded = await sdk.admin.upload.create({ files: [file] })
      const url = uploaded.files?.[0]?.url
      if (url) setForm((current) => ({ ...current, image_url: url }))
    } catch {
      toast.error("Не удалось загрузить фото")
    }
  }

  if (isLoading) {
    return (
      <Container>
        <Text>Загрузка</Text>
      </Container>
    )
  }

  if (isError || !data?.banner) {
    return (
      <Container>
        <Text>Баннер не найден</Text>
      </Container>
    )
  }

  const banner = data.banner

  return (
    <div className="flex flex-col gap-y-4">
      <Button variant="transparent" onClick={() => navigate("/banners")} className="px-0">
        <ArrowLeft />
        Баннеры
      </Button>
      <Container className="flex flex-col gap-y-4 p-6">
        <Heading>{SLOT_LABELS[banner.slot] || banner.slot}</Heading>
        <div className="flex items-center gap-x-2">
          <Switch
            checked={form.enabled}
            onCheckedChange={(value) =>
              setForm((current) => ({ ...current, enabled: Boolean(value) }))
            }
          />
          <Label>Показывать на витрине</Label>
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Заголовок</Label>
          <Input
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Текст</Label>
          <Textarea
            rows={4}
            value={form.body}
            onChange={(event) =>
              setForm((current) => ({ ...current, body: event.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Кнопка</Label>
          <Input
            placeholder="Подпись"
            value={form.cta_label}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                cta_label: event.target.value,
              }))
            }
          />
          <Input
            placeholder="Ссылка, например /products"
            value={form.cta_href}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                cta_href: event.target.value,
              }))
            }
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Фото</Label>
          <Input type="file" accept="image/*" onChange={onUpload} />
          {form.image_url ? (
            <img src={form.image_url} alt="" className="max-h-40 object-contain" />
          ) : null}
        </div>
        <Button onClick={() => save.mutate()} isLoading={save.isPending}>
          Сохранить
        </Button>
      </Container>
    </div>
  )
}

export default BannerEditPage
