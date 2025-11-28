require('dotenv').config()
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const Stripe = require('stripe')

// --- CONFIG ---
const STRIPE_SECRET = process.env.STRIPE_SECRET
const OUT_DIR_INVOICES = './stripe_invoices'
const OUT_DIR_RECEIPTS = './stripe_receipts'

// Change these to the month/time-range you want:
const FROM = Math.floor(new Date('2025-11-01').getTime() / 1000)
const TO = Math.floor(new Date('2025-11-30').getTime() / 1000)
// ------------

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' })

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

async function downloadFile(url, filepath) {
  const resp = await axios({
    url,
    method: 'GET',
    responseType: 'stream',
    auth: { username: STRIPE_SECRET, password: '' },
  })

  const writer = fs.createWriteStream(filepath)
  resp.data.pipe(writer)

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve)
    writer.on('error', reject)
  })
}

async function downloadInvoices() {
  console.log('\n=== Downloading Invoices ===')

  const params = {
    limit: 100,
    created: { gte: FROM, lte: TO },
    status: 'paid',
  }

  const invoices = await stripe.invoices.list(params)
  let count = 0
  let total = 0

  for (const inv of invoices.data) {
    if (inv.total == 0 || !inv.paid) continue
    if (!inv.invoice_pdf) continue
    total += inv.total

    const createdDate = new Date(inv.created * 1000).toISOString().slice(0, 10)
    const filename = `${createdDate}_invoice_${inv.id}.pdf`
    const filepath = path.join(OUT_DIR_INVOICES, filename)

    await downloadFile(inv.invoice_pdf, filepath)
    console.log(`📄 Invoice saved: ${filename}`)
    count++

    await delay(200) // prevent hitting Stripe rate limits
  }

  console.log(`✅ Finished downloading ${count} invoices.`)
  console.log(`Total earned: $${(total / 100).toFixed(2)}`)
}

async function downloadReceipts() {
  console.log('\n=== Downloading Receipts ===')

  // Stripe receipts come from Charges
  const params = {
    limit: 100,
    created: { gte: FROM, lte: TO },
  }

  const charges = await stripe.charges.list(params)
  let count = 0
  let total = 0

  for (const ch of charges.data) {
    if (!ch.paid) continue
    if (!ch.receipt_url) continue
    total += ch.amount

    const createdDate = new Date(ch.created * 1000).toISOString().slice(0, 10)
    const filename = `${createdDate}_receipt_${ch.id}.pdf`
    const filepath = path.join(OUT_DIR_RECEIPTS, filename)
    const pdfUrl = ch.receipt_url.replace(/(\?s=.*)$/i, '/pdf$1')

    await downloadFile(pdfUrl, filepath)
    console.log(`🧾 Receipt saved: ${filename}`)

    count++
    await delay(200)
  }

  console.log(`✅ Finished downloading ${count} receipts.`)
  console.log(`Total earned: $${(total / 100).toFixed(2)}`)
}

async function downloadAll() {
  fs.mkdirSync(OUT_DIR_INVOICES, { recursive: true })
  fs.mkdirSync(OUT_DIR_RECEIPTS, { recursive: true })

  await downloadInvoices()
  await downloadReceipts()

  console.log('\n🎉 DONE — All invoices & receipts downloaded!')
}

downloadAll().catch((err) => {
  console.error('❌ Error:', err)
})
