import type { ReportDocument } from '@report-studio/shared';

export const SAMPLE_REPORT_DOCUMENT: ReportDocument = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: 'FY 2026 Enterprise Infrastructure & Margin Review' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Annualized recurring revenue expanded 34% year-over-year across core cloud workloads while compute unit costs declined following multi-region cluster consolidation. This executive briefing pairs audited ledger tables with deterministic vector telemetry ready for signed distribution.',
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '1. Quarterly Operating Ledger' }],
    },
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Click inside any cell below to adjust figures, paste tab-separated rows directly from Excel or Google Sheets, or click ',
        },
        {
          type: 'text',
          marks: [{ type: 'bold' }],
          text: 'Table to Chart',
        },
        {
          type: 'text',
          text: ' in the contextual bar to plot selected rows.',
        },
      ],
    },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quarter' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ARR ($M)' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Operating Cash Flow ($M)' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gross Margin (%)' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q1 25' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '112.4' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '28.6' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '71.2' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q2 25' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '126.8' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '33.4' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '72.8' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q3 25' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '141.5' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '39.8' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '74.1' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q4 25' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '158.2' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '46.5' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '75.6' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Q1 26' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '176.9' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '54.2' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '77.4' }] }] },
          ],
        },
      ],
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '2. Revenue Trajectory & Confidence Envelope' }],
    },
    {
      type: 'tanstackChart',
      attrs: {
        id: 'chart-arr-trajectory',
        chartType: 'line',
        title: 'Annualized Recurring Revenue vs. Operating Cash Flow ($M)',
        subtitle: 'Includes custom Bezier regression trendline, confidence band, and FY26 target benchmark',
        xKey: 'quarter',
        yKeys: ['ARR', 'Cash Flow'],
        data: [
          { quarter: 'Q1 25', ARR: 112.4, 'Cash Flow': 28.6 },
          { quarter: 'Q2 25', ARR: 126.8, 'Cash Flow': 33.4 },
          { quarter: 'Q3 25', ARR: 141.5, 'Cash Flow': 39.8 },
          { quarter: 'Q4 25', ARR: 158.2, 'Cash Flow': 46.5 },
          { quarter: 'Q1 26', ARR: 176.9, 'Cash Flow': 54.2 },
          { quarter: 'Q2 26 (Est)', ARR: 194.0, 'Cash Flow': 61.8 },
        ],
        customCurveOptions: {
          enabled: true,
          showTrendCurve: true,
          showConfidenceBand: true,
          targetValue: 185,
          targetLabel: 'FY26 Target',
          curveTension: 'monotoneX',
          connectorStyle: 'dashed',
          accentColor: '#b45309',
        },
        width: 680,
        height: 310,
      },
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '3. Regional Enterprise Deployment Mix' }],
    },
    {
      type: 'tanstackChart',
      attrs: {
        id: 'chart-regional-mix',
        chartType: 'bar',
        title: 'Enterprise Net New Bookings by Region ($M)',
        subtitle: 'Grouped comparison across Q4 FY25 and Q1 FY26 close cycles',
        xKey: 'region',
        yKeys: ['Q4 FY25', 'Q1 FY26'],
        data: [
          { region: 'North America', 'Q4 FY25': 38.4, 'Q1 FY26': 44.1 },
          { region: 'EMEA', 'Q4 FY25': 24.2, 'Q1 FY26': 29.8 },
          { region: 'APAC', 'Q4 FY25': 16.5, 'Q1 FY26': 21.4 },
          { region: 'LATAM', 'Q4 FY25': 8.1, 'Q1 FY26': 10.6 },
        ],
        customCurveOptions: {
          enabled: false,
          showTrendCurve: false,
          showConfidenceBand: false,
          curveTension: 'monotoneX',
          connectorStyle: 'dashed',
        },
        width: 680,
        height: 290,
      },
    },
    {
      type: 'columnSection',
      attrs: {
        columns: 2,
        layout: '50-50',
      },
      content: [
        {
          type: 'columnBlock',
          content: [
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Cloud Margin Catalysts' }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Cluster autoscaling cut idle GPU compute by 21% across US-East and EU-West.',
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Multi-year reserved capacity commitments locked in 14% unit rate savings.',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'columnBlock',
          content: [
            {
              type: 'heading',
              attrs: { level: 3 },
              content: [{ type: 'text', text: 'Q2 FY26 Operating Priorities' }],
            },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Expand EMEA sovereign tenancy nodes ahead of Q3 enterprise renewals.',
                        },
                      ],
                    },
                  ],
                },
                {
                  type: 'listItem',
                  content: [
                    {
                      type: 'paragraph',
                      content: [
                        {
                          type: 'text',
                          text: 'Maintain gross margin above 77.5% while onboarding 18 Fortune 500 pilots.',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Every chart above is compiled through @report-studio/shared in both browser DOM and headless Chromium so exported PDF and DOCX deliverables preserve exact vector geometry.',
            },
          ],
        },
      ],
    },
  ],
};
