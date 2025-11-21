import React, { useState } from 'react';

export default function LandlordReportForm() {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [propertyAddress, setPropertyAddress] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (uploadedFile) => {
    if (uploadedFile.type === 'application/pdf') {
      setFile(uploadedFile);
      setError('');
      setIsComplete(false);
    } else {
      setError('Please upload a PDF file');
      setFile(null);
    }
  };

  const generateReport = async () => {
    if (!file) {
      setError('Please upload a file first');
      return;
    }

    if (!propertyAddress.trim()) {
      setError('Please enter the property address');
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      const pages = await extractPdfPages(uint8Array);
      const propertyInfo = extractPropertyInfo(pages.propertyText || '');
      
      // Get AI-generated market report
      const city = propertyInfo.city || extractCity(propertyAddress);
      const state = propertyInfo.state || extractState(propertyAddress);
      
      console.log('Generating AI market report for:', city, state);
      
      let marketReport = '';
      try {
        const reportResponse = await fetch('/api/generate-report', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            city: city,
            state: state,
            address: propertyAddress
          }),
        });

        if (reportResponse.ok) {
          const data = await reportResponse.json();
          marketReport = data.report;
          console.log('Market report generated successfully');
        } else {
          console.error('Failed to generate market report');
          marketReport = `Market report could not be generated. Please try again.`;
        }
      } catch (err) {
        console.error('Error calling API:', err);
        marketReport = `Market report generation failed. Please check your API configuration.`;
      }
      
      propertyInfo.finalAddress = propertyAddress;
      
      await createPowerPoint(pages.firstPage, pages.lastPage, propertyInfo, marketReport);
      
      setIsComplete(true);
      setIsProcessing(false);
    } catch (err) {
      console.error('Error:', err);
      setError(`Error: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const extractCity = (address) => {
    const parts = address.split(',');
    return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
  };

  const extractState = (address) => {
    const match = address.match(/,\s*([A-Z]{2})\s*\d{0,5}\s*$/);
    return match ? match[1] : '';
  };

  const extractPdfPages = async (pdfData) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
      script.onload = async () => {
        try {
          const pdfjsLib = window['pdfjs-dist/build/pdf'];
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
          
          const loadingTask = pdfjsLib.getDocument({ data: pdfData });
          const pdf = await loadingTask.promise;
          const numPages = pdf.numPages;
          
          const firstPageObj = await pdf.getPage(1);
          const firstPageData = await renderPageToCanvas(firstPageObj);
          
          let propertyText = '';
          try {
            const textContent = await firstPageObj.getTextContent();
            propertyText = textContent.items.map(item => item.str || '').join(' ');
          } catch (textErr) {
            console.warn('Could not extract text from PDF:', textErr);
          }
          
          const lastPageObj = await pdf.getPage(numPages);
          const lastPageData = await renderPageToCanvas(lastPageObj);
          
          resolve({ 
            firstPage: firstPageData,
            lastPage: lastPageData,
            propertyText: propertyText || ''
          });
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = () => reject(new Error('Failed to load PDF library'));
      document.head.appendChild(script);
    });
  };

  const renderPageToCanvas = async (page) => {
    const scale = 2;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const dominantColor = extractDominantColor(imageData);
    
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width: viewport.width,
      height: viewport.height,
      dominantColor: dominantColor
    };
  };

  const extractDominantColor = (imageData) => {
    const data = imageData.data;
    const colorCount = {};
    
    for (let i = 0; i < data.length; i += 40) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      if (r > 240 && g > 240 && b > 240) continue;
      
      const key = `${Math.round(r/10)*10},${Math.round(g/10)*10},${Math.round(b/10)*10}`;
      colorCount[key] = (colorCount[key] || 0) + 1;
    }
    
    let maxCount = 0;
    let dominantColor = '2C5AA0';
    
    for (const [color, count] of Object.entries(colorCount)) {
      if (count > maxCount) {
        maxCount = count;
        const [r, g, b] = color.split(',').map(Number);
        dominantColor = rgbToHex(r, g, b);
      }
    }
    
    return dominantColor;
  };

  const rgbToHex = (r, g, b) => {
    return ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
  };

  const extractPropertyInfo = (text) => {
    if (!text) {
      return {
        name: '[Property Name]',
        size: '[XX,XXX SF]',
        location: '[City, State]',
        availableSpace: '[X,XXX SF]',
        rent: '$[XX.XX]/SF/YR',
        city: '',
        state: ''
      };
    }
    
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    let propertyName = '[Property Name]';
    const titlePatterns = [
      /^([A-Z\s&]{10,60}?)(?=\s*(?:OFFERING|MEMORANDUM|\d{3,5}\s+[A-Z]))/i,
      /([A-Z][a-z\s&']+(?:Shopping Center|Plaza|Center|Square|Commons|Mall))/i
    ];
    
    for (const pattern of titlePatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1] && match[1].length > 5) {
        propertyName = match[1].trim();
        break;
      }
    }
    
    let city = '';
    let state = '';
    
    const locationPatterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}),\s*([A-Z]{2})\b/,
      /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s+\d{5}/
    ];
    
    for (const pattern of locationPatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1] && match[2]) {
        city = match[1];
        state = match[2];
        break;
      }
    }
    
    let location = city && state ? `${city}, ${state}` : '[City, State]';
    
    let size = '[XX,XXX SF]';
    const sizePatterns = [
      /(\d{1,3}(?:,\d{3})+)\s*(?:SF|Square Feet)/i,
      /(?:Building|Property|Total)[\s:]*(\d{1,3}(?:,\d{3})+)\s*SF/i
    ];
    
    for (const pattern of sizePatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        const sqft = parseInt(match[1].replace(/,/g, ''));
        if (sqft >= 1000 && sqft <= 1000000) {
          size = `${match[1]} SF`;
          break;
        }
      }
    }
    
    let availableSpace = '[X,XXX SF]';
    const availablePatterns = [
      /(?:Available|For Lease)[\s:]*(\d{1,3}(?:,\d{3})+)\s*SF/i
    ];
    
    for (const pattern of availablePatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        const sqft = parseInt(match[1].replace(/,/g, ''));
        if (sqft >= 500 && sqft <= 1000000) {
          availableSpace = `${match[1]} SF`;
          break;
        }
      }
    }
    
    let rent = '$[XX.XX]/SF/YR';
    const rentPatterns = [
      /\$\s*(\d{1,3}(?:\.\d{2})?)\s*(?:\/\s*SF|PSF)/i,
      /(?:Rent|Rate)[\s:]*\$\s*(\d{1,3}(?:\.\d{2})?)\s*\/\s*SF/i
    ];
    
    for (const pattern of rentPatterns) {
      const match = cleanText.match(pattern);
      if (match && match[1]) {
        const rate = parseFloat(match[1]);
        if (rate >= 5 && rate <= 200) {
          rent = `$${match[1]}/SF/YR`;
          break;
        }
      }
    }
    
    return {
      name: propertyName,
      size: size,
      location: location,
      availableSpace: availableSpace,
      rent: rent,
      city: city,
      state: state
    };
  };

  const createPowerPoint = async (firstPageData, lastPageData, propertyInfo, marketSummary) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
      script.onload = async () => {
        try {
          const pptx = new window.PptxGenJS();
          
          const slideWidth = firstPageData.width / 96;
          const slideHeight = firstPageData.height / 96;
          
          pptx.defineLayout({ 
            name: 'CUSTOM', 
            width: slideWidth, 
            height: slideHeight 
          });
          pptx.layout = 'CUSTOM';
          
          const brandColor = firstPageData.dominantColor || '2C5AA0';
          const lightBrand = lightenColor(brandColor, 45);
          
          // Slide 1: Cover
          const slide1 = pptx.addSlide();
          slide1.addImage({
            data: firstPageData.dataUrl,
            x: 0,
            y: 0,
            w: slideWidth,
            h: slideHeight
          });
          
          // Slide 2: Activity Summary
          const slide2 = pptx.addSlide();
          slide2.background = { color: 'F8FAFC' };
          
          slide2.addShape(pptx.ShapeType.rect, {
            x: 0,
            y: 0,
            w: slideWidth,
            h: slideHeight * 0.10,
            fill: { color: brandColor }
          });
          
          slide2.addText('LEASING ACTIVITY REPORT', {
            x: slideWidth * 0.03,
            y: slideHeight * 0.02,
            w: slideWidth * 0.94,
            h: slideHeight * 0.035,
            fontSize: 32,
            bold: true,
            color: 'FFFFFF',
            fontFace: 'Calibri',
            valign: 'middle'
          });
          
          slide2.addText('Reporting Period: January 1 - 14, 2025', {
            x: slideWidth * 0.03,
            y: slideHeight * 0.06,
            w: slideWidth * 0.94,
            h: slideHeight * 0.028,
            fontSize: 14,
            color: 'FFFFFF',
            fontFace: 'Calibri',
            valign: 'middle'
          });
          
          const topY = slideHeight * 0.12;
          const topH = slideHeight * 0.16;
          
          // Property card
          const propX = slideWidth * 0.03;
          const propW = slideWidth * 0.30;
          
          slide2.addShape(pptx.ShapeType.rect, {
            x: propX,
            y: topY,
            w: propW,
            h: topH,
            fill: { color: 'FFFFFF' },
            line: { color: 'E2E8F0', width: 1 }
          });
          
          slide2.addShape(pptx.ShapeType.rect, {
            x: propX,
            y: topY,
            w: propW,
            h: topH * 0.18,
            fill: { color: lightBrand }
          });
          
          slide2.addText('PROPERTY', {
            x: propX,
            y: topY,
            w: propW,
            h: topH * 0.18,
            fontSize: 13,
            bold: true,
            color: '1E293B',
            fontFace: 'Calibri',
            align: 'center',
            valign: 'middle'
          });
          
          slide2.addText(propertyInfo.name, {
            x: propX + propW * 0.05,
            y: topY + topH * 0.25,
            w: propW * 0.9,
            h: topH * 0.15,
            fontSize: 15,
            bold: true,
            color: brandColor,
            fontFace: 'Calibri',
            valign: 'middle'
          });
          
          slide2.addText(`${propertyInfo.size} | ${propertyInfo.location}`, {
            x: propX + propW * 0.05,
            y: topY + topH * 0.46,
            w: propW * 0.9,
            h: topH * 0.12,
            fontSize: 11,
            color: '64748B',
            fontFace: 'Calibri',
            valign: 'middle'
          });
          
          slide2.addText(`Available: ${propertyInfo.availableSpace}`, {
            x: propX + propW * 0.05,
            y: topY + topH * 0.64,
            w: propW * 0.9,
            h: topH * 0.12,
            fontSize: 11,
            color: '475569',
            fontFace: 'Calibri',
            valign: 'middle'
          });
          
          slide2.addText(`Rent: ${propertyInfo.rent}`, {
            x: propX + propW * 0.05,
            y: topY + topH * 0.80,
            w: propW * 0.9,
            h: topH * 0.12,
            fontSize: 11,
            color: '475569',
            fontFace: 'Calibri',
            valign: 'middle'
          });
          
          // KPI cards
          const kpiStartX = slideWidth * 0.35;
          const kpiW = slideWidth * 0.10;
          const kpiGap = slideWidth * 0.008;
          
          const metrics = { outbound: 45, inbound: 15, tours: 12, prospects: 28, proposals: 7, followups: 34 };
          const kpis = [
            { label: 'Outbound', value: metrics.outbound },
            { label: 'Inbound', value: metrics.inbound },
            { label: 'Tours', value: metrics.tours },
            { label: 'Prospects', value: metrics.prospects },
            { label: 'Proposals', value: metrics.proposals },
            { label: 'Follow-ups', value: metrics.followups }
          ];
          
          kpis.forEach((kpi, idx) => {
            const x = kpiStartX + (idx * (kpiW + kpiGap));
            
            slide2.addShape(pptx.ShapeType.rect, {
              x: x,
              y: topY,
              w: kpiW,
              h: topH,
              fill: { color: 'FFFFFF' },
              line: { color: 'E2E8F0', width: 1 }
            });
            
            slide2.addShape(pptx.ShapeType.rect, {
              x: x,
              y: topY,
              w: kpiW,
              h: topH * 0.1,
              fill: { color: brandColor }
            });
            
            slide2.addText(kpi.value.toString(), {
              x: x,
              y: topY + topH * 0.28,
              w: kpiW,
              h: topH * 0.3,
              fontSize: 36,
              bold: true,
              color: brandColor,
              fontFace: 'Calibri',
              align: 'center',
              valign: 'middle'
            });
            
            slide2.addText(kpi.label, {
              x: x,
              y: topY + topH * 0.68,
              w: kpiW,
              h: topH * 0.18,
              fontSize: 11,
              bold: true,
              color: '1E293B',
              fontFace: 'Calibri',
              align: 'center',
              valign: 'middle'
            });
          });
          
          // Market Insights Section
          const marketY = slideHeight * 0.31;
          const marketH = slideHeight * 0.63;
          
          slide2.addShape(pptx.ShapeType.rect, {
            x: slideWidth * 0.03,
            y: marketY,
            w: slideWidth * 0.94,
            h: marketH,
            fill: { color: 'FFFFFF' },
            line: { color: 'E2E8F0', width: 1 }
          });
          
          slide2.addShape(pptx.ShapeType.rect, {
            x: slideWidth * 0.03,
            y: marketY,
            w: slideWidth * 0.94,
            h: marketH * 0.08,
            fill: { color: lightBrand }
          });
          
          slide2.addText('LOCAL MARKET INSIGHTS - LAST 60 DAYS', {
            x: slideWidth * 0.03,
            y: marketY,
            w: slideWidth * 0.94,
            h: marketH * 0.08,
            fontSize: 15,
            bold: true,
            color: '1E293B',
            fontFace: 'Calibri',
            align: 'center',
            valign: 'middle'
          });
          
          slide2.addText(marketSummary, {
            x: slideWidth * 0.05,
            y: marketY + marketH * 0.12,
            w: slideWidth * 0.90,
            h: marketH * 0.82,
            fontSize: 14,
            color: '1E293B',
            fontFace: 'Calibri',
            align: 'left',
            valign: 'top',
            paraSpaceAfter: 12
          });
          
          // Contact list slides
          createContactListSlide(pptx, 'OUTBOUND ACTIVITY', 'Tenants We Contacted', 
            generateMockOutboundContacts(45), brandColor, slideWidth, slideHeight);
          
          createContactListSlide(pptx, 'INBOUND ACTIVITY', 'Tenants Who Contacted Us', 
            generateMockInboundContacts(32), brandColor, slideWidth, slideHeight);
          
          // Last slide
          const slideLast = pptx.addSlide();
          slideLast.addImage({
            data: lastPageData.dataUrl,
            x: 0,
            y: 0,
            w: slideWidth,
            h: slideHeight
          });
          
          await pptx.writeFile({ fileName: 'Landlord_Update_Report.pptx' });
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      script.onerror = () => reject(new Error('Failed to load PowerPoint library'));
      document.head.appendChild(script);
    });
  };

  const createContactListSlide = (pptx, title, subtitle, contacts, brandColor, slideWidth, slideHeight) => {
    const tableStartY = slideHeight * 0.16;
    const rowHeight = slideHeight * 0.038;
    const availableHeight = slideHeight - tableStartY - slideHeight * 0.08;
    const maxRowsPerSlide = Math.floor(availableHeight / rowHeight) - 1;
    
    const totalSlides = Math.ceil(contacts.length / maxRowsPerSlide);
    
    for (let slideNum = 0; slideNum < totalSlides; slideNum++) {
      const slide = pptx.addSlide();
      slide.background = { color: 'F8FAFC' };
      
      slide.addShape(pptx.ShapeType.rect, {
        x: 0,
        y: 0,
        w: slideWidth,
        h: slideHeight * 0.11,
        fill: { color: brandColor }
      });
      
      const slideTitle = totalSlides > 1 ? `${title} (${slideNum + 1}/${totalSlides})` : title;
      
      slide.addText(slideTitle, {
        x: slideWidth * 0.03,
        y: slideHeight * 0.023,
        w: slideWidth * 0.94,
        h: slideHeight * 0.045,
        fontSize: 32,
        bold: true,
        color: 'FFFFFF',
        fontFace: 'Calibri',
        valign: 'middle'
      });
      
      slide.addText(subtitle, {
        x: slideWidth * 0.03,
        y: slideHeight * 0.07,
        w: slideWidth * 0.94,
        h: slideHeight * 0.03,
        fontSize: 14,
        color: 'FFFFFF',
        fontFace: 'Calibri',
        valign: 'middle'
      });
      
      const tableWidth = slideWidth * 0.94;
      const colWidths = { company: 0.35, contact: 0.25, date: 0.15, method: 0.12, status: 0.13 };
      
      slide.addShape(pptx.ShapeType.rect, {
        x: slideWidth * 0.03,
        y: tableStartY,
        w: tableWidth,
        h: rowHeight * 1.15,
        fill: { color: 'FFFFFF' },
        line: { color: 'CBD5E1', width: 0.5 }
      });
      
      let xPos = slideWidth * 0.03;
      
      const headers = ['Company', 'Contact Name', 'Date', 'Method', 'Status'];
      const widths = [colWidths.company, colWidths.contact, colWidths.date, colWidths.method, colWidths.status];
      
      headers.forEach((header, i) => {
        slide.addText(header, {
          x: xPos + (i === 0 ? tableWidth * 0.015 : 0),
          y: tableStartY,
          w: tableWidth * widths[i],
          h: rowHeight * 1.15,
          fontSize: 13,
          bold: true,
          color: '1E293B',
          fontFace: 'Calibri',
          valign: 'middle'
        });
        xPos += tableWidth * widths[i];
      });
      
      const startIdx = slideNum * maxRowsPerSlide;
      const endIdx = Math.min(startIdx + maxRowsPerSlide, contacts.length);
      const slideContacts = contacts.slice(startIdx, endIdx);
      
      slideContacts.forEach((contact, idx) => {
        const y = tableStartY + rowHeight * 1.15 + (idx * rowHeight);
        const bgColor = idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC';
        
        slide.addShape(pptx.ShapeType.rect, {
          x: slideWidth * 0.03,
          y: y,
          w: tableWidth,
          h: rowHeight,
          fill: { color: bgColor },
          line: { color: 'E2E8F0', width: 0.3 }
        });
        
        let xPos = slideWidth * 0.03;
        const values = [contact.company, contact.contact, contact.date, contact.method, contact.status];
        const fontSizes = [12, 12, 12, 12, 11];
        
        values.forEach((value, i) => {
          slide.addText(value, {
            x: xPos + (i === 0 ? tableWidth * 0.015 : 0),
            y: y,
            w: tableWidth * widths[i] - (i === 0 ? tableWidth * 0.02 : tableWidth * 0.01),
            h: rowHeight,
            fontSize: fontSizes[i],
            color: i === 0 ? '1E293B' : '475569',
            fontFace: 'Calibri',
            valign: 'middle'
          });
          xPos += tableWidth * widths[i];
        });
      });
      
      const footerText = totalSlides > 1 
        ? `Showing ${startIdx + 1}-${endIdx} of ${contacts.length} contacts`
        : `Total Contacts: ${contacts.length}`;
      
      slide.addText(footerText, {
        x: slideWidth * 0.03,
        y: slideHeight * 0.95,
        w: tableWidth,
        fontSize: 11,
        bold: true,
        color: '64748B',
        fontFace: 'Calibri',
        align: 'right'
      });
    }
  };

  const generateMockOutboundContacts = (count) => {
    const companies = ['Starbucks Coffee', 'Chipotle Mexican Grill', 'Planet Fitness', 'Orangetheory Fitness', 
      'Five Guys Burgers', 'Dunkin Donuts', 'Jersey Mikes Subs', 'Massage Envy', 'Great Clips', 
      'Anytime Fitness', 'Sprint Mobile', 'H&R Block', 'Supercuts', 'Jimmy Johns', 'Subway',
      'Panera Bread', 'CVS Pharmacy', 'Walgreens', 'Dollar Tree', 'Dollar General',
      'AT&T Store', 'Verizon Wireless', 'T-Mobile', 'Cricket Wireless', 'Metro PCS',
      'Fantastic Sams', 'Sport Clips', 'Nail Salon Express', 'European Wax Center', 'Hand & Stone Massage',
      'LA Fitness', 'Crunch Fitness', '24 Hour Fitness', 'Snap Fitness', 'Retro Fitness',
      'Qdoba Mexican Grill', 'Moe\'s Southwest Grill', 'Panda Express', 'Noodles & Company', 'Potbelly',
      'Firehouse Subs', 'Which Wich', 'Penn Station', 'Charleys Philly Steaks', 'Blaze Pizza'];
    const contacts = ['John Smith', 'Sarah Johnson', 'Mike Davis', 'Emily Wilson', 'Chris Anderson',
      'Jennifer Lee', 'David Brown', 'Amanda Taylor', 'Robert Martinez', 'Lisa Garcia',
      'Michael Thompson', 'Jessica White', 'Daniel Harris', 'Ashley Martin', 'James Rodriguez'];
    const methods = ['Call', 'Email', 'Call', 'Email', 'Call'];
    const statuses = ['Left VM', 'No Response', 'Responded', 'Follow-up', 'Declined', 'In Discussion'];
    
    return Array.from({ length: count }, (_, i) => ({
      company: companies[i % companies.length],
      contact: contacts[i % contacts.length],
      date: `1/${(i % 14) + 1}/25`,
      method: methods[i % methods.length],
      status: statuses[i % statuses.length]
    }));
  };

  const generateMockInboundContacts = (count) => {
    const companies = ['Target Corporation', 'Trader Joes', 'Whole Foods Market', 'HomeGoods', 
      'TJ Maxx', 'Marshalls', 'Ulta Beauty', 'Sephora', 'Panera Bread', 'Shake Shack', 
      'Lululemon', 'Apple Store', 'Best Buy', 'Dick\'s Sporting Goods', 'Bed Bath & Beyond',
      'Ross Dress for Less', 'Burlington', 'Nordstrom Rack', 'DSW', 'Famous Footwear',
      'Pet Supplies Plus', 'PetSmart', 'Petco', 'Bath & Body Works', 'Victoria\'s Secret',
      'Gap', 'Old Navy', 'Banana Republic', 'J.Crew', 'Ann Taylor',
      'Sweetgreen', 'Cava', 'Chipotle', 'CorePower Yoga'];
    const contacts = ['Jennifer Lee', 'David Brown', 'Amanda Taylor', 'Robert Martinez',
      'Lisa Garcia', 'Kevin White', 'Michelle Johnson', 'Brian Davis', 'Nicole Anderson',
      'Steven Wilson', 'Rachel Thompson', 'Andrew Harris', 'Stephanie Martin'];
    const methods = ['Call', 'Email', 'Portal', 'Call', 'Email'];
    const statuses = ['In Discussion', 'Scheduled Tour', 'Sent Info', 'Awaiting Response', 'Hot Lead'];
    
    return Array.from({ length: count }, (_, i) => ({
      company: companies[i % companies.length],
      contact: contacts[i % contacts.length],
      date: `1/${(i % 14) + 1}/25`,
      method: methods[i % methods.length],
      status: statuses[i % statuses.length]
    }));
  };

  const lightenColor = (hex, percent) => {
    const num = parseInt(hex, 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + Math.round((255 - ((num >> 16) & 0xff)) * percent / 100));
    const g = Math.min(255, ((num >> 8) & 0xff) + Math.round((255 - ((num >> 8) & 0xff)) * percent / 100));
    const b = Math.min(255, (num & 0xff) + Math.round((255 - (num & 0xff)) * percent / 100));
    return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            Landlord Update Report
          </h1>
          <p className="text-slate-400 text-lg">
            Automated Biweekly Report Generator with AI Market Insights
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Property Address (Required for AI Market Report)
            </label>
            <input
              type="text"
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              placeholder="e.g., 123 Main Street, Livermore, CA 94550"
              className="w-full px-4 py-3 border-2 border-slate-300 rounded-xl focus:border-blue-500 focus:outline-none text-sm"
            />
            <p className="text-xs text-slate-500 mt-2">
              AI will search the web for live retail market data within 10 miles of this address
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Property Offering Memorandum
            </label>
            <div
              className={`relative border-2 border-dashed rounded-2xl p-8 transition-all ${
                dragActive
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-300 bg-slate-50 hover:border-slate-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                accept=".pdf"
                onChange={handleChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 mx-auto mb-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                {file ? (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-900">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        setIsComplete(false);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Remove file
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-slate-600 mb-1">
                      <span className="font-semibold text-blue-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-slate-500">PDF files only</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start space-x-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-600 flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
              <div>
                <p className="text-sm font-semibold text-red-900">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {isComplete && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center space-x-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600 flex-shrink-0"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              <div>
                <p className="text-sm font-semibold text-green-900">Report generated successfully!</p>
                <p className="text-xs text-green-700">Your PowerPoint with AI market insights has been downloaded.</p>
              </div>
            </div>
          )}

          <button
            onClick={generateReport}
            disabled={!file || isProcessing}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-white transition-all flex items-center justify-center space-x-2 ${
              !file || isProcessing
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl'
            }`}
          >
            {isProcessing ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Generating AI Report & PowerPoint...</span>
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
                <span>Generate PowerPoint Report</span>
              </>
            )}
          </button>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <p className="text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-900">How it works:</span> Upload your offering memorandum and enter the property address. The AI will automatically search the web for live retail market data, recent lease transactions, and local developments to generate a professional market report with your PowerPoint.
            </p>
          </div>
        </div>

        <div className="text-center mt-6">
          <p className="text-slate-400 text-sm">
            Commercial Real Estate Leasing Team
          </p>
        </div>
      </div>
    </div>
  );
}
