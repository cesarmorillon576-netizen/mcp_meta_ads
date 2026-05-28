import bizSdk from 'facebook-nodejs-business-sdk';
const { FacebookAdsApi, AdAccount } = bizSdk;

const TOKEN = "EAA5pd0elBfgBRmqTAs7yJLeGS29NqAxbfxia5eVSC8Vh2d51YdgL0hj8ftPvSNetvSAoNyphe2DxExRiNIHlkXDnbDN1P6ZAJ3XG82zx4LxcGjIcUMquIJFOcw7fvMVAgwZAcGvpeXorBQ083cxbDjWRLH0GNxr9LMQffrB6KsvEqK3vC8lKfLLLTCepO57wZDZD";

FacebookAdsApi.init(TOKEN);

const account = new AdAccount('act_1183700420453296');
const cursor = await account.getInsights(
  ['campaign_name', 'impressions', 'clicks', 'spend', 'actions', 'cost_per_action_type'],
  {
    time_range: JSON.stringify({ since: '2026-05-01', until: '2026-05-28' }),
    level: 'campaign',
    limit: 5,
  }
);

const arr = [];
cursor.forEach(item => arr.push(item));

const item = arr[0];
console.log('=== Keys on item ===');
console.log(Object.keys(item));
console.log('\n=== item.actions ===');
console.log(item.actions);
console.log('\n=== item._data.actions ===');
console.log(item._data?.actions);
console.log('\n=== JSON.stringify(item) ===');
console.log(JSON.stringify(item, null, 2));
