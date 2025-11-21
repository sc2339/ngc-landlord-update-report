import Head from 'next/head';
import LandlordReportForm from '../components/LandlordReportForm';

export default function Home() {
  return (
    <>
      <Head>
        <title>Landlord Update Report Generator</title>
        <meta name="description" content="Automated biweekly landlord reports with AI market insights" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <LandlordReportForm />
    </>
  );
}
