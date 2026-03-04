'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { apiClient } from '@/lib/api/client'
import { AlertCircle, CheckCircle, XCircle } from 'lucide-react'

export default function VoiceScreeningDebugPage() {
  const [campaignId, setCampaignId] = useState('')
  const [loading, setLoading] = useState(false)
  const [debugData, setDebugData] = useState<any>(null)
  const [error, setError] = useState('')

  const checkCampaign = async () => {
    if (!campaignId.trim()) {
      setError('Please enter a campaign ID')
      return
    }

    setLoading(true)
    setError('')
    setDebugData(null)

    try {
      const response = await apiClient['client'].get(
        `/api/v1/voice-screening/campaigns/${campaignId}/debug-config`
      )
      setDebugData(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to fetch debug data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Voice Screening Debug</h1>
        <p className="text-muted-foreground mt-2">
          Check if campaign VAPI configuration is correctly set up for structured data extraction
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Check Campaign Configuration</CardTitle>
          <CardDescription>
            Enter a campaign ID to verify its VAPI configuration and structured data schema
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="campaignId">Campaign ID</Label>
              <Input
                id="campaignId"
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                placeholder="Enter campaign UUID"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={checkCampaign} disabled={loading}>
                {loading ? 'Checking...' : 'Check Configuration'}
              </Button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div>
                <p className="font-medium text-red-900">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {debugData && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-5 border border-blue-200">
                <h3 className="font-semibold text-lg mb-4">Configuration Status</h3>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Campaign Name</span>
                    <span className="text-sm text-gray-700">{debugData.campaign_name}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Has VAPI Config</span>
                    {debugData.has_vapi_config ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Has Analysis Plan</span>
                    {debugData.has_analysis_plan ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Has Structured Data Plan</span>
                    {debugData.has_structured_data_plan ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Schema Fields Count</span>
                    <Badge variant={debugData.schema_fields_count > 0 ? 'default' : 'destructive'}>
                      {debugData.schema_fields_count} fields
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <span className="text-sm font-medium">Generated Schema Fields</span>
                    <Badge>{debugData.generated_schema_fields} fields</Badge>
                  </div>
                </div>
              </div>

              {debugData.vapi_config_keys && (
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                  <h3 className="font-semibold mb-3">VAPI Config Keys</h3>
                  <div className="flex flex-wrap gap-2">
                    {debugData.vapi_config_keys.map((key: string) => (
                      <Badge key={key} variant="outline">
                        {key}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {debugData.analysis_plan_preview && (
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                  <h3 className="font-semibold mb-3">Analysis Plan Preview</h3>
                  <pre className="text-xs bg-white p-4 rounded-lg border overflow-auto max-h-96">
                    {JSON.stringify(debugData.analysis_plan_preview, null, 2)}
                  </pre>
                </div>
              )}

              {/* Diagnostic Summary */}
              <div className={`rounded-lg p-5 border ${
                debugData.has_structured_data_plan && debugData.schema_fields_count > 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-yellow-50 border-yellow-200'
              }`}>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  {debugData.has_structured_data_plan && debugData.schema_fields_count > 0 ? (
                    <>
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <span className="text-green-900">Configuration is Correct</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                      <span className="text-yellow-900">Configuration Issue Detected</span>
                    </>
                  )}
                </h3>
                <div className="text-sm space-y-1">
                  {!debugData.has_vapi_config && (
                    <p className="text-yellow-800">❌ Campaign does not have vapi_config - please regenerate the campaign</p>
                  )}
                  {!debugData.has_analysis_plan && (
                    <p className="text-yellow-800">❌ vapi_config is missing analysisPlan - structured data won't be extracted</p>
                  )}
                  {!debugData.has_structured_data_plan && (
                    <p className="text-yellow-800">❌ analysisPlan is missing structuredDataPlan - structured data won't be extracted</p>
                  )}
                  {debugData.schema_fields_count === 0 && (
                    <p className="text-yellow-800">❌ Schema has 0 fields - no data will be extracted</p>
                  )}
                  {debugData.has_structured_data_plan && debugData.schema_fields_count > 0 && (
                    <p className="text-green-800">✅ Campaign is properly configured to extract {debugData.schema_fields_count} fields</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-blue-900">How to Get Campaign ID</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-800 space-y-2">
          <p>1. Go to Voice Screening dashboard</p>
          <p>2. Click on a campaign name to view details</p>
          <p>3. Copy the campaign ID from the URL (last part after /campaigns/)</p>
          <p>4. Paste it above and click "Check Configuration"</p>
        </CardContent>
      </Card>

      <Card className="bg-purple-50 border-purple-200">
        <CardHeader>
          <CardTitle className="text-purple-900">Troubleshooting Tips</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-purple-800 space-y-3">
          <div>
            <p className="font-medium">If structured data is not being extracted:</p>
            <ul className="list-disc list-inside mt-2 space-y-1 ml-2">
              <li>Verify campaign has "Has Structured Data Plan" = ✓</li>
              <li>Check "Schema Fields Count" is greater than 0</li>
              <li>If missing, recreate the campaign (old campaigns may not have this)</li>
              <li>Ensure you're using the campaign's vapi_config when starting the call</li>
              <li>Check backend logs after call ends for VAPI API response</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
