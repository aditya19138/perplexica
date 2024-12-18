import React from 'react';

interface ChartLinkProps {
    fileUrls: string[];
}

const ChartsLinkList: React.FC<ChartLinkProps> = ({ fileUrls }) => {
    return (
        <div style={styles.container}>
            <h3>Charts :</h3>
            <ul style={styles.linkList}>
                {fileUrls.map((url, index) => (
                    <li key={index} style={styles.listItem}>
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={styles.link}
                        >
                            Chart {index + 1}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
};

// Inline styles for subtle and consistent appearance
const styles: { [key: string]: React.CSSProperties } = {
    container: {
        backgroundColor: "rgba(255,255,255,0)",
        // padding: "10px 15px",
        // borderRadius: "8px",
        // marginTop: "15px",
        fontFamily: "'Roboto', sans-serif",
    },
    heading: {
        fontSize: "15px",
        marginBottom: "10px",
        color: "#ccc",
        fontWeight: "bold",
        letterSpacing: "1px",
    },
    linkList: {
        listStyleType: "none",
        margin: 0,
        padding: 0,
    },
    listItem: {
        marginBottom: "5px",
    },
    link: {
        color: "#e0e0e0", // Same as the message text
        fontWeight: "bold",
        textDecoration: "underline",
        fontSize: "18px",
        cursor: "pointer",
        transition: "opacity 0.2s ease-in-out",
    },
    linkHover: {
        opacity: "0.8",
    }
};


export default ChartsLinkList;
