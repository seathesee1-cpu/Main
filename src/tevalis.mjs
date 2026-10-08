export const regions = {
  dubai: { companyId: 1549, secret: 'TEVALIS_DUBAI_GUID', sites: [9424, 8808, 9524, 8809] },
  'abu-dhabi': { companyId: 1580, secret: 'TEVALIS_ABU_DHABI_GUID', sites: [10947, 9884, 8066] },
};

export function dateRange(startDate, endDate, maxDays) {
  const valid = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(value.slice(0, 10)).toISOString().slice(0, 10) === value.slice(0, 10);
  if (!valid(startDate) || !valid(endDate)) throw new Error('Use valid ISO timestamps with an explicit timezone; UAE uses +04:00.');
  const duration = Date.parse(endDate) - Date.parse(startDate);
  if (duration <= 0 || duration > maxDays * 86400000) throw new Error(`Date range must be positive and at most ${maxDays} days.`);
  return { StartDate: startDate, EndDate: endDate };
}

export function createTevalis(env, fetcher = fetch) {
  async function get(region, path, parameters = {}) {
    const config = regions[region];
    if (!config) throw new Error('Unknown region.');
    if (!env[config.secret] || !env.TEVALIS_DEV_ID) throw new Error('Tevalis credentials are not configured for this region.');
    const url = new URL(path, 'https://api.tevalis.com');
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
    let response;
    try {
      response = await fetcher(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(25000),
        headers: { CompanyId: String(config.companyId), GUID: env[config.secret], DevID: env.TEVALIS_DEV_ID,
          Accept: 'application/json', 'Content-Type': 'application/json' },
      });
    } catch { throw new Error('Tevalis request failed or timed out.'); }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Tevalis returned HTTP ${response.status}.`);
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Tevalis returned an empty response.');
    let size = 0; const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8 * 1024 * 1024) { await reader.cancel(); throw new Error('Tevalis response exceeds 8 MiB; use a shorter date range.'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error('Tevalis returned invalid JSON.'); }
  }
  function siteRegion(siteId) {
    const region = Object.keys(regions).find(key => regions[key].sites.includes(siteId));
    if (!region) throw new Error('Site is outside the seven authorized venues.');
    return region;
  }
  return {
    async sites({ region }) {
      const config = regions[region];
      if (!config) throw new Error('Unknown region.');
      const result = await get(region, '/Sites');
      if (!Array.isArray(result)) throw new Error('Unexpected Tevalis sites response.');
      const sites = result.filter(s => config.sites.includes(s.SiteID)).map(s => ({ siteId: s.SiteID, name: s.Name, region }));
      return { source: 'tevalis_api', sites, missingSiteIds: config.sites.filter(id => !sites.some(s => s.siteId === id)) };
    },
    async sales({ siteId, startDate, endDate }) {
      const region = siteRegion(siteId);
      const result = await get(region, `/v2/Sales/GetSalesExport/${siteId}`, dateRange(startDate, endDate, 1));
      if (result.SiteID !== siteId || !Array.isArray(result.transactions)) throw new Error('Unexpected Tevalis sales response.');
      const fields = ['ActualGrossAmt', 'ActualNetAmt', 'TaxAmt', 'ServiceChargeAmt', 'GratuityAmt', 'TotalDiscountAmount'];
      const totals = {};
      for (const field of fields) {
        if (result.transactions.some(t => typeof t[field] !== 'number' || !Number.isFinite(t[field]))) throw new Error('Tevalis sales totals contain missing or nonnumeric amounts.');
        totals[field] = Math.round(result.transactions.reduce((sum, t) => sum + t[field], 0) * 100) / 100;
      }
      return { source: 'tevalis_api', siteId, startDate, endDate, transactionCount: result.transactions.length,
        refundTransactionCount: result.transactions.filter(t => t.IsRefund === true).length, totals,
        note: 'Sums of Tevalis transaction header amounts as returned, including refunds with their supplied signs. Currency is not inferred. Tevalis documents a 60-minute cache.' };
    },
    async stock({ siteId, offset = 0, limit = 25 }) {
      const region = siteRegion(siteId);
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid pagination.');
      const result = await get(region, `/Stock/GetInventoryLevelsAtLocation/${siteId}`);
      if (result.SiteID !== siteId || !Array.isArray(result.Products)) throw new Error('Unexpected Tevalis stock response.');
      return { source: 'tevalis_api', siteId, total: result.Products.length, offset,
        products: result.Products.slice(offset, offset + limit),
        nextOffset: offset + limit < result.Products.length ? offset + limit : null };
    },
    async zReports({ siteId, startDate, endDate }) {
      const region = siteRegion(siteId);
      const reports = await get(region, `/ZReport/${siteId}`, dateRange(startDate, endDate, 14));
      if (!Array.isArray(reports) || reports.some(r => r.SiteID !== siteId)) throw new Error('Unexpected Tevalis Z-report response.');
      return { source: 'tevalis_api', siteId, reports };
    },
    async attendance({ siteId, startDate, endDate, userId, offset = 0, limit = 25 }) {
      const region = siteRegion(siteId);
      const parameters = dateRange(startDate, endDate, 14);
      if (userId !== undefined) {
        if (!Number.isInteger(userId) || userId <= 0) throw new Error('Invalid user ID.');
        parameters.UserID = userId;
      }
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid pagination.');
      const data = await get(region, `/Attendance/${siteId}`, parameters);
      if (data.SiteID !== siteId || !Array.isArray(data.UserAttendance)) throw new Error('Unexpected Tevalis attendance response.');
      const users = data.UserAttendance.filter(user => userId === undefined || user.UserID === userId);
      return { source: 'tevalis_api', siteId, startDate, endDate, totalUsers: users.length,
        users: users.slice(offset, offset + limit), nextOffset: offset + limit < users.length ? offset + limit : null,
        note: 'Recorded clock events, preserved as returned by Tevalis. No clock events are created or changed. Event times without timezone must not be assumed UTC.' };
    },
    async attendanceEdits({ siteId, startDate, endDate, userId, offset = 0, limit = 25 }) {
      const region = siteRegion(siteId);
      dateRange(startDate, endDate, 14);
      if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid pagination.');
      const parameters = { ChangedStartDate: startDate, ChangedEndDate: endDate };
      if (userId !== undefined) {
        if (!Number.isInteger(userId) || userId <= 0) throw new Error('Invalid user ID.');
        parameters.UserID = userId;
      }
      const data = await get(region, `/Attendance/GetAttendanceLogEdits/${siteId}`, parameters);
      if (data.SiteID !== siteId || !Array.isArray(data.AttendanceLogEdits)) throw new Error('Unexpected Tevalis attendance-edit response.');
      const edits = data.AttendanceLogEdits.filter(edit => userId === undefined || edit.UserID === userId);
      return { source: 'tevalis_api', siteId, totalEdits: edits.length, edits: edits.slice(offset, offset + limit),
        nextOffset: offset + limit < edits.length ? offset + limit : null };
    },
  };
}
