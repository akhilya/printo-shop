import { MedusaContainer } from "@medusajs/framework"
import { createApiKeysWorkflow } from "@medusajs/medusa/core-flows"

export default async function createDelegatKey({
  container,
}: {
  container: MedusaContainer
}) {
  const { result } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Delegat",
          type: "secret",
          created_by: "",
        },
      ],
    },
  })

  const key = result[0] as { token?: string; id?: string }
  const token = key.token
  if (!token) {
    throw new Error("Secret API key token was not returned. Create one in Admin → Settings → Developer.")
  }

  console.log("")
  console.log("Delegat connection:")
  console.log("  apiBaseUrl = http://localhost:9000/admin/delegat")
  console.log(`  apiKey     = ${token}`)
  console.log("")
}
