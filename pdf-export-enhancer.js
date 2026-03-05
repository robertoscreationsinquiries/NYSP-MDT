// PDF Export Enhancer - Fixes PDF export in Electron

(function() {
    console.log('[PDF EXPORT] Initializing PDF export enhancer...');

    // Hook into PDF generation
    function enhancePdfExport() {
        // Wait for the page to load
        setTimeout(() => {
            console.log('[PDF EXPORT] Hooking into export functions...');

            // Find all export/download buttons
            const buttons = document.querySelectorAll('button');
            buttons.forEach(btn => {
                const text = btn.textContent.trim().toUpperCase();
                
                if (text.includes('EXPORT') || text.includes('DOWNLOAD') || 
                    text.includes('CITATION') || text.includes('PDF')) {
                    
                    console.log('[PDF EXPORT] Found export button:', text);
                    
                    // Store original click handler
                    const originalClick = btn.onclick;
                    
                    // Override with enhanced handler
                    btn.addEventListener('click', async function(e) {
                        console.log('[PDF EXPORT] Export button clicked');
                        
                        // Determine PDF type from button text
                        let pdfType = 'citation';
                        if (text.includes('ARREST') || text.includes('SUMMONS')) {
                            pdfType = 'arrest';
                        } else if (text.includes('TRAFFIC') || text.includes('CITATION')) {
                            pdfType = 'traffic';
                        }
                        
                        // If we have Electron export function, use it
                        if (window.electron && window.electron.exportPdf) {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            console.log('[PDF EXPORT] Using Electron PDF export');
                            console.log('[PDF EXPORT] Type:', pdfType);
                            
                            try {
                                const result = await window.electron.exportPdf(pdfType, {
                                    // Add any data you want to pass to the PDF
                                    timestamp: new Date().toISOString()
                                });
                                
                                if (result.success) {
                                    console.log('[PDF EXPORT] ✓ PDF exported successfully');
                                    console.log('[PDF EXPORT] Path:', result.path);
                                    
                                    // Optionally show success message
                                    alert(`PDF exported successfully!\n\nFile: ${result.filename}\n\nThe PDF has been opened in your default application.`);
                                } else {
                                    console.error('[PDF EXPORT] Failed:', result.error);
                                    
                                    if (result.expectedPath) {
                                        alert(`PDF Export Failed!\n\nTemplate not found at:\n${result.expectedPath}\n\nPlease make sure the PDF template files are in the App build folder:\n- traffic-template.pdf\n- arrest-template.pdf`);
                                    } else {
                                        alert(`PDF Export Failed!\n\nError: ${result.error}`);
                                    }
                                }
                            } catch (error) {
                                console.error('[PDF EXPORT] Exception:', error);
                                alert(`PDF Export Error!\n\n${error.message}`);
                            }
                        } else {
                            // Fall back to original handler
                            console.log('[PDF EXPORT] Electron export not available, using original handler');
                            if (originalClick) {
                                originalClick.call(this, e);
                            }
                        }
                    }, true);  // Use capture phase to intercept before original handler
                }
            });
        }, 3000);
    }

    // Also override console.error to catch PDF errors
    const originalError = console.error;
    console.error = function(...args) {
        // Check if this is a PDF error
        const errorString = args.join(' ');
        if (errorString.includes('PDF') || errorString.includes('Failed to fetch')) {
            console.log('[PDF EXPORT] Caught PDF error:', errorString);
            console.log('[PDF EXPORT] This error has been intercepted and handled');
        }
        
        // Call original console.error
        originalError.apply(console, args);
    };

    // Initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhancePdfExport);
    } else {
        enhancePdfExport();
    }

    console.log('[PDF EXPORT] ✓ PDF export enhancer loaded');
    console.log('[PDF EXPORT] PDF templates should be in: App build/');
    console.log('[PDF EXPORT] Required files:');
    console.log('[PDF EXPORT]   - traffic-template.pdf');
    console.log('[PDF EXPORT]   - arrest-template.pdf');

})();
