require('dotenv').config()
const fs = require('fs')
const path = require('path')
const axios = require('axios')
const Stripe = require('stripe')

// --- CONFIG ---
const STRIPE_SECRET = process.env.STRIPE_SECRET
const OUT_DIR = './stripe_invoices'

// Change these to the month/time-range you want:
const FROM = Math.floor(new Date('2025-10-01').getTime() / 1000) // UNIX timestamp (seconds)
const TO = Math.floor(new Date('2025-10-31').getTime() / 1000)
// ------------

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: '2023-10-16' })

async function downloadAll() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const listParams = {
    limit: 100,
    created: { gte: FROM, lte: TO },
    status: 'paid',
  }

  const invoices = await stripe.invoices.list(listParams)

  for await (const inv of invoices.autoPagingIterable()) {
    if (!inv.invoice_pdf) {
      console.log(`⚠️ Invoice ${inv.id} has no PDF URL, skipping.`)
      continue
    }

    const pdfUrl = inv.invoice_pdf
    const createdDate = new Date(inv.created * 1000).toISOString().slice(0, 10)
    const filename = `${createdDate}_invoice_${inv.id}.pdf`
    const filepath = path.join(OUT_DIR, filename)

    const resp = await axios({
      url: pdfUrl,
      method: 'GET',
      responseType: 'stream',
      auth: {
        username: STRIPE_SECRET,
        password: '',
      },
    })

    const writer = fs.createWriteStream(filepath)
    resp.data.pipe(writer)

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve)
      writer.on('error', reject)
    })

    console.log(`✅ Saved ${filename}`)
  }

  console.log('🎉 Done — all invoice PDFs downloaded!')
}

downloadAll().catch((err) => {
  console.error('❌ Error:', err)
})
