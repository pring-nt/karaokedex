const songList=[{product:"MAJOR/ALPHA/CELLO/X3/PIANO XL HDD",years:[{year:2026,months:[{month:"November",link:"https://www.mediafire.com/file_premium/pr2u1ikmvayqdye/HDD_2026_November_Additional_Song_List.pdf/file"},{month:"October",link:"https://www.mediafire.com/file_premium/druxgc6297ckjgx/HDD_2026_October_Additional_Song_List.pdf/file"},{month:"September",link:"https://www.mediafire.com/file_premium/s0nqgwlzcy988x5/HDD_2026_September_Additional_Song_List.pdf/file"}]},{year:2025,months:[{month:"December",link:"https://www.mediafire.com/file_premium/c1hv3eq7qugq9m3/HDD_2025_December_Additional_Song_List.pdf/file"},{month:"November",link:"https://www.mediafire.com/file_premium/r67iolzzrffl1m6/HDD_2025_November_Additional_Song_List.pdf/file"},{month:"October",link:"https://www.mediafire.com/file_premium/99nl9w6a2tetrup/HDD_2025_October_Additional_Song_List.pdf/file"}]}]},{product:"BMB / X2 / X1 / HDD",years:[{year:2020,months:[{month:"December",link:"https://www.mediafire.com/file/0ol0xmvyb15zjrm/BMB_X2__2020_December_Additional_Song_List.pdf/file"},{month:"November",link:"https://www.mediafire.com/file/ez031cupanbaq3w/BMB_X2_2020_November_Additional_Song_List.pdf/file"}]}]},{product:"P-SERIES",volumes:[{volume:78,link:"https://www.mediafire.com/file/fyo0v2repfn0huw/P-Series_Volume_78_Additional_List.pdf/file"},{volume:61,link:"https://www.mediafire.com/file/o790rq2oogrwlrm/P-Series_Volume_61_Additional_List.pdf/file"},{volume:"53-59",link:"https://www.mediafire.com/file/cvbu3krwbbvvq76/P-series_Volume_53_-_59_additional_list.pdf/file"}]},{product:"BRAVO",volumes:[{volume:9,link:"https://www.mediafire.com/file/yre96hdk77esmw9/Platinum_Bravo__-_Volume_9_Additonal_OPM_only_-_12pp_only.pdf/file"},{volume:8,link:"https://www.mediafire.com/file/9pcb6892l9zmhc2/Volume_8_Platinum_Bravo.pdf/file"}]}],songListHtml=`
<H2 class="songlist">Songlist Update</H2>
   ${songList.map(({product,years,volumes})=>`
      <details class="products">
      <summary class="product">${product}</summary>

        ${years?years.map(({year,months})=>`
            <details class="years">
                <summary class="year">${year}</summary>

                ${months.map(({month,link})=>`
                    <div class="month">
                    <p>${month}</p>
                    <a href="${link}" target="_blank">
                    <img src="https://cdn.shopify.com/s/files/1/2581/7224/files/image_preview_1.png?v=1522229496" width="33" height="28"/>
                    </a>
                    </div>
                    `).join("")}

                </details>
                `).join(""):""}

        ${volumes?volumes.map(({volume,link})=>`
                    <div class="volume">
                    <p>Volume ${volume}</p>
                    <a href="${link}" target="_blank">
                    <img src="https://cdn.shopify.com/s/files/1/2581/7224/files/image_preview_1.png?v=1522229496" width="33" height="28"/>
                    </a>
                    </div>
                    `).join(""):""}

            </details>
            `).join("")}
`;function initSonglistUpdate(){const root=document.getElementById("songlist-update-root");if(!root)return;root.innerHTML=songListHtml;const products=document.querySelectorAll(".products");products.forEach(product=>{product.addEventListener("toggle",()=>{product.hasAttribute("open")&&products.forEach(p=>{p!==product&&p.removeAttribute("open")})})});const years=document.querySelectorAll(".years");years.forEach(year=>{year.addEventListener("toggle",()=>{year.open&&years.forEach(y=>{y!==year&&y.removeAttribute("open")})})})}document.addEventListener("DOMContentLoaded",initSonglistUpdate),document.addEventListener("shopify:section:load",initSonglistUpdate);
//# sourceMappingURL=/cdn/shop/t/50/assets/songlist-update-data.js.map?v=155022796841148418491792385173
