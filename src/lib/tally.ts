export interface CartItem {
  id: string;
  name: string;
  hindi_name: string;
  unit: 'kg' | 'pcs' | 'plate';
  quantity: number; // e.g. 0.25 (250g), 0.5 (500g), 1, 2
  price_per_unit: number;
  total_price: number;
  tax_rate: number;
}

export interface BillOrder {
  bill_number: string;
  date: string; // YYYYMMDD
  customer_name?: string;
  customer_phone?: string;
  payment_mode: 'Cash' | 'UPI' | 'Card' | 'Udhaar';
  items: CartItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  grand_total: number;
  company_name: string;
}

function formatDateToTally(dateObj: Date): string {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Builds the exact Tally XML Voucher Import envelope for a sweet shop sales bill
 */
export function buildSalesVoucherXML(order: BillOrder): string {
  const tallyDate = order.date || formatDateToTally(new Date());
  const partyAccount =
    order.payment_mode === 'Cash'
      ? 'Cash'
      : order.payment_mode === 'Udhaar' && order.customer_name
      ? order.customer_name
      : 'Cash';

  // Format ledger entries for Tally:
  // 1. Party Ledger (Debited for Grand Total)
  // 2. Sales Account (Credited for Subtotal)
  // 3. CGST Output (Credited if applicable)
  // 4. SGST Output (Credited if applicable)

  const hasGst = order.cgst > 0 || order.sgst > 0;

  const itemNarrations = order.items
    .map((item) => {
      const qtyStr =
        item.unit === 'kg' && item.quantity < 1
          ? `${Math.round(item.quantity * 1000)}g`
          : `${item.quantity} ${item.unit}`;
      return `${item.name} (${qtyStr} @ ₹${item.price_per_unit})`;
    })
    .join(', ');

  const narration = `Bill #${order.bill_number} | Mode: ${order.payment_mode} | Items: ${itemNarrations} ${
    order.customer_phone ? `| Ph: ${order.customer_phone}` : ''
  }`;

  // Total Credit = Subtotal + CGST + SGST
  const totalTax = order.cgst + order.sgst;
  const exactTotal = order.subtotal + totalTax;
  const roundOff = Number((order.grand_total - exactTotal).toFixed(2));

  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${order.company_name || 'Spj'}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>${tallyDate}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <PARTYLEDGERNAME>${partyAccount}</PARTYLEDGERNAME>
            <REFERENCE>${order.bill_number}</REFERENCE>
            <NARRATION>${narration.replace(/[<>&'"]/g, '')}</NARRATION>
            
            <!-- 1. Party Account (Debited - Negative in Tally) -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${partyAccount}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${order.grand_total.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- 2. Sales Account (Credited - Positive in Tally) -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${order.subtotal.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            ${
              hasGst
                ? `
            <!-- 3. CGST Output -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST OUTPUT</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${order.cgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>

            <!-- 4. SGST Output -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST OUTPUT</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${order.sgst.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`
                : ''
            }
            ${
              roundOff !== 0
                ? `
            <!-- 5. ROUND OFF Ledger -->
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>ROUND OFF</LEDGERNAME>
              <ISDEEMEDPOSITIVE>${roundOff < 0 ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE>
              <AMOUNT>${roundOff.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`
                : ''
            }
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

/**
 * Send voucher XML to Tally via internal Next.js bridge route
 */
export async function pushVoucherToTally(
  tallyUrl: string,
  order: BillOrder
): Promise<{ success: boolean; message: string; raw?: string }> {
  try {
    const xml = buildSalesVoucherXML(order);
    const res = await fetch('/api/tally-bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tally_url: tallyUrl,
        xml_payload: xml,
      }),
    });

    const data = await res.json();
    if (!data.success) {
      return { success: false, message: data.error || 'Tally push failed' };
    }

    const respText = data.xml_response || '';
    const hasCreated =
      respText.includes('<CREATED>1</CREATED>') ||
      respText.includes('<ALTERED>1</ALTERED>') ||
      /<CREATED>[1-9]\d*<\/CREATED>/.test(respText);

    if (hasCreated) {
      return { success: true, message: 'Voucher synced to Tally!', raw: respText };
    }

    if (respText.includes('<ERRORS>') && !respText.includes('<ERRORS>0</ERRORS>')) {
      const match = respText.match(/<LINEERROR>(.*?)<\/LINEERROR>/);
      const errMsg = match ? match[1] : 'Tally rejected voucher XML';
      return { success: false, message: errMsg, raw: respText };
    }

    if (respText.includes('<EXCEPTIONS>') && !respText.includes('<EXCEPTIONS>0</EXCEPTIONS>')) {
      return { success: false, message: 'Voucher saved with Data Exceptions in Tally', raw: respText };
    }

    return { success: true, message: 'Synced to TallyPrime', raw: respText };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error' };
  }
}
