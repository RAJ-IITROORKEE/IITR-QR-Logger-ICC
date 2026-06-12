import { AdminAccessManager } from "@/components/admin/admin-access-manager"
import { ensureDefaultAccessAccounts } from "@/lib/access-auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

async function getAccessAccounts() {
  try {
    await ensureDefaultAccessAccounts()
    const accounts = await prisma.accessAccount.findMany({ orderBy: [{ role: "asc" }, { createdAt: "desc" }] })
    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        role: account.role,
        name: account.name,
        username: account.username,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      })),
      error: null,
    }
  } catch (error) {
    return { accounts: [], error: error instanceof Error ? error.message : "Unable to load access accounts" }
  }
}

export default async function AdminAccessPage() {
  const data = await getAccessAccounts()
  return <AdminAccessManager initialAccounts={data.accounts} initialError={data.error} />
}
