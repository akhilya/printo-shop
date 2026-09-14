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
import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { renderLegalMarkdown } from "../../../../lib/legal-markdown"
import { sdk } from "../../../lib/sdk"

type AdminLegalPage = {
  id: string
  slug: string
  title: string
  body: string
  enabled: boolean
}

const SLUG_LABELS: Record<string, string> = {
  delivery: "Доставка",
  returns: "Возврат",
  offer: "Оферта",
  contacts: "Контакты",
  privacy: "Конфиденциальность",
}

const LegalPageEdit = () => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    title: "",
    body: "",
    enabled: true,
  })

  const { data, isLoading, isError } = useQuery({
    queryFn: () =>
      sdk.client.fetch<{ page: AdminLegalPage }>(`/admin/legal-pages/${id}`),
    queryKey: ["admin-legal-page", id],
    enabled: Boolean(id),
  })

  useEffect(() => {
    const page = data?.page
    if (!page) return
    setForm({
      title: page.title || "",
      body: page.body || "",
      enabled: page.enabled !== false,
    })
  }, [data])

  const preview = useMemo(
    () => renderLegalMarkdown(form.body),
    [form.body]
  )

  const save = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/legal-pages/${id}`, {
        method: "POST",
        body: form,
      }),
    onSuccess: () => {
      toast.success("Документ сохранён")
      queryClient.invalidateQueries({ queryKey: ["admin-legal-pages"] })
      queryClient.invalidateQueries({ queryKey: ["admin-legal-page", id] })
    },
    onError: () => toast.error("Не удалось сохранить документ"),
  })

  if (isLoading) {
    return (
      <Container>
        <Text>Загрузка</Text>
      </Container>
    )
  }

  if (isError || !data?.page) {
    return (
      <Container>
        <Text>Страница не найдена</Text>
      </Container>
    )
  }

  const page = data.page
  const path = `/${page.slug}`

  return (
    <div className="flex flex-col gap-y-4">
      <Button
        variant="transparent"
        onClick={() => navigate("/legal-pages")}
        className="px-0"
      >
        <ArrowLeft />
        Документы
      </Button>
      <Container className="flex flex-col gap-y-4 p-6">
        <Heading>{SLUG_LABELS[page.slug] || page.slug}</Heading>
        <div className="flex items-center gap-x-2">
          <Switch
            checked={form.enabled}
            onCheckedChange={(value) =>
              setForm((current) => ({ ...current, enabled: Boolean(value) }))
            }
          />
          <Label>Показывать в подвале</Label>
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
          <Label>Текст (Markdown)</Label>
          <Text size="small" className="text-ui-fg-subtle">
            Заголовки # ##, списки - или 1., ссылки [текст](https://…), **жирный**.
          </Text>
          <Textarea
            rows={16}
            value={form.body}
            onChange={(event) =>
              setForm((current) => ({ ...current, body: event.target.value }))
            }
          />
        </div>
        <div className="flex flex-col gap-y-2">
          <Label>Предпросмотр</Label>
          <div
            className="border-ui-border-base txt-small text-ui-fg-base max-w-prose overflow-auto border p-4 [&_a]:underline [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-medium [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: preview }}
          />
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          На витрине: {path}
        </Text>
        <Button onClick={() => save.mutate()} isLoading={save.isPending}>
          Сохранить
        </Button>
      </Container>
    </div>
  )
}

export default LegalPageEdit
