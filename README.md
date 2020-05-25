# CKEditor 5 anchor

This package implements the anchor feature for CKEditor 5. It allows inserting anchor elements (ID field) into the edited content and offers the UI to create and edit them.

## Getting Started

These instructions will get you a install this library in your CKEditor project.

### Prerequisites

This library needs CKEditor5 in order to work properly.

### Installing

Add ckeditor5 anchor as dependency in package.json:
```
"@ckeditor/ckeditor5-anchor": "bvedad/ckeditor5-anchor",
```

Import package
```javascript
import Anchor from '@ckeditor/ckeditor5-anchor/src/anchor';
```

Use it in the code
```javascript
ClassicEditor
    .create( document.querySelector( '#editor' ), {
        plugins: [ Anchor, ... ],
        toolbar: [ 'anchor', ... ],
    } )
    .then( ... )
    .catch( ... );
```


## Authors

* **Vedad Burgić (InProd Solutions)** - *Initial work* - [bvedad](https://github.com/bvedad)

## Acknowledgments

* CKEditor5 anchor feature